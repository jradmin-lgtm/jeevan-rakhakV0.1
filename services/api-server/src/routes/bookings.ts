import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, isNull, sql as drizzleSql } from "drizzle-orm";
import { db, bookingEvents, bookings, driverLocations, drivers, hospitals, sosDispatchAttempts, users } from "@jr/db";

// Pilot cap: any single user may hold only 1 active (un-terminal) booking at
// a time. The earlier value of 3 confused testers — they'd dispatch a second
// ambulance while the first was still en route. One ride at a time matches
// real-world emergency dispatch and avoids resource waste.
const MAX_ACTIVE_BOOKINGS_PER_USER = 1;
import { config } from "@jr/config";
import { haversineDistanceKm } from "@jr/utils";
import { dismissPushToDriver, dismissPushToUser, pushToUser, sendPush } from "../push";
import { getLiveRoute } from "../google-maps";
import { renderPushTemplate } from "../push-i18n";
// v1.3.1: when a ride reaches a terminal state (COMPLETED / CANCELLED) any
// still-ACTIVE in-ride safety alert for that booking is stale and must be
// auto-resolved (clears responder cards + stands the raiser's bar down).
import { autoResolveSafetyForBooking } from "./safety";
// v1.0.14: fare logic is in services/api-server/src/fare-config.ts —
// the single editable spot for rates, multipliers, surcharges. Change a
// constant there → redeploy → mobile UI re-quotes on next mount. No APK
// rebuild needed since pricing is server-driven.
import { computeFare, computeFareTotal, applyCoupon } from "../fare-config";

const bookingCreateSchema = z.object({
  emergencyType: z.enum([
    "ACCIDENT_TRAUMA",
    "CARDIAC",
    "BREATHING_DISTRESS",
    "PREGNANCY_NEONATAL",
    "GENERAL_CRITICAL_TRANSFER"
  ]),
  pickupLat: z.number(),
  pickupLng: z.number(),
  pickupAddress: z.string().max(500).optional(),
  dropLat: z.number().optional(),
  dropLng: z.number().optional(),
  dropAddress: z.string().max(500).optional(),
  // Optional coupon the patient applied in the user app. Server validates it
  // against COUPONS below and stores the resulting discountInr + payableInr
  // on the booking row so admin sees the same fare math the patient saw.
  couponCode: z.string().max(40).optional(),
  // v1.0.15: true when the booking originated from the SOS panic button.
  // Server treats SOS specially: skips the public pending pool, starts the
  // cascade engine, and defers payment to the post-completion screen.
  isSos: z.boolean().optional()
});

// v1.0.14: all fare logic lives in services/api-server/src/fare-config.ts.
// `computeFare()` returns the full breakdown for /fares/quote, and
// `computeFareTotal()` is the convenience shortcut for /bookings POST
// (just the number to persist). Both are pure functions — no DB, no env.

export async function registerBookingRoutes(app: FastifyInstance) {
  // Service-area descriptor. PUBLIC (no auth) so the apps can render the launch
  // banner + an out-of-area message on the very first screen, before a token
  // exists. Values come straight from config (no DB) so this is cheap and the
  // same source the booking-hot-path geofence guard reads from.
  app.get("/api/v1/service-area", async (_req: any, reply) => {
    return reply.send({
      enabled: config.geofenceEnabled,
      cityName: config.launchCityName,
      hospitalName: config.launchHospitalName,
      centerLat: config.geofenceCenterLat,
      centerLng: config.geofenceCenterLng,
      radiusKm: config.launchRadiusKm
    });
  });

  // v1.0.13: fare-quote endpoint. Stateless, called by the user app whenever
  // pickup/drop coords or coupon change so the booking screen shows the
  // exact number that will hit the bookings row. Auth-required so we don't
  // expose pricing publicly (could leak business model).
  const fareQuoteSchema = z.object({
    pickupLat: z.number(),
    pickupLng: z.number(),
    dropLat: z.number().optional().nullable(),
    dropLng: z.number().optional().nullable(),
    couponCode: z.string().max(40).optional().nullable(),
    // v1.0.13 (revised) — multipliers driven by these inputs. Optional so
    // older clients keep working (defaults: BLS vehicle, no emergency mult).
    vehicleType: z.string().max(16).optional().nullable(),
    emergencyType: z.string().max(40).optional().nullable()
  });
  app.post(
    "/api/v1/fares/quote",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const parsed = fareQuoteSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const { pickupLat, pickupLng, dropLat, dropLng, couponCode, vehicleType, emergencyType } = parsed.data;
      const quote = computeFare(
        pickupLat, pickupLng,
        dropLat ?? undefined, dropLng ?? undefined,
        couponCode,
        vehicleType,
        emergencyType
      );
      // 2026-08-17 exploration (FLAG_GOOGLE_ETA_ENABLED, default off): additive
      // `liveEtaMin` alongside the existing `etaMin` (which stays the
      // AVG_KMH×ROAD_FACTOR estimate — see fare-config.ts). Never touches
      // distanceKm/totalInr, so pricing is unaffected either way; this is a
      // display-only improvement, not a re-pricing. Null when the flag is
      // off, there's no drop point yet, or the Google call fails.
      let liveEtaMin: number | null = null;
      if (config.googleLiveEtaEnabled && dropLat != null && dropLng != null) {
        const route = await getLiveRoute(pickupLat, pickupLng, dropLat, dropLng);
        if (route) liveEtaMin = Math.round(route.durationMin);
      }
      return reply.send({ ...quote, liveEtaMin });
    }
  );

  // v1.1.0 (CR#3/#6): list active destination hospitals. Auth-required (any
  // role) so the apps can render the destination label/pin and admin can read
  // the same list. Default hospital sorts first.
  app.get(
    "/api/v1/hospitals",
    { preHandler: [(app as any).authenticate] },
    async (_req: any, reply) => {
      // v1.2.1 sec-fix: explicit safe-column select. A bare `db.select()`
      // here leaked portal_password_hash (+ username) to EVERY authenticated
      // user/driver. The KYC picker only needs id/name/coords/contact/flags —
      // NO portal_* columns ever cross this boundary.
      const rows = await db
        .select({
          id: hospitals.id,
          name: hospitals.name,
          lat: hospitals.lat,
          lng: hospitals.lng,
          address: hospitals.address,
          city: hospitals.city,
          phone: hospitals.phone,
          active: hospitals.active,
          isDefault: hospitals.isDefault
        })
        .from(hospitals)
        .where(eq(hospitals.active, true))
        .orderBy(desc(hospitals.isDefault), hospitals.name);
      return reply.send({ hospitals: rows });
    }
  );

  // Create booking (user)
  app.post(
    "/api/v1/bookings",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user") return reply.code(403).send({ error: "user_only" });
      const parsed = bookingCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const data = parsed.data;

      // Geofence guard — runs for BOTH normal and SOS bookings (it sits before
      // the isSos branch), so an out-of-area request never inserts a row, emits
      // an event, or starts a cascade. No DB query in this hot path: the center
      // + radius come straight from config (the seeded default hospital). When
      // FLAG_GEOFENCE_ENABLED is off this whole block is skipped.
      if (config.geofenceEnabled) {
        const distKm = haversineDistanceKm(
          data.pickupLat,
          data.pickupLng,
          config.geofenceCenterLat,
          config.geofenceCenterLng
        );
        if (distKm > config.launchRadiusKm) {
          return reply.code(403).send({
            error: "out_of_service_area",
            message:
              "Jeevan Rakshak is currently live in " +
              config.launchCityName +
              " only. We cannot dispatch to your location yet.",
            distanceKm: Math.round(distKm),
            radiusKm: config.launchRadiusKm
          });
        }
      }

      // Block disabled accounts from booking. JWT is still valid (issued before
      // admin flipped the flag) but the booking POST is the meaningful action.
      const [me] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
      if (me?.disabled) {
        return reply.code(403).send({ error: "account_disabled", message: "This account has been disabled. Contact support." });
      }

      // Enforce the active-bookings cap before paying for a DB insert. Bookings
      // in REQUESTED / ACCEPTED / ARRIVED / PICKED_UP count toward the limit;
      // COMPLETED / CANCELLED / TIMED_OUT do not.
      const [activeCountRow] = await db
        .select({ c: count() })
        .from(bookings)
        .where(
          and(
            eq(bookings.userId, sub),
            drizzleSql`${bookings.status} IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')`
          )
        );
      const activeCount = Number(activeCountRow?.c ?? 0);
      if (activeCount >= MAX_ACTIVE_BOOKINGS_PER_USER) {
        return reply.code(429).send({
          error: "max_active_bookings_reached",
          message: "You already have an active ride. Please complete or cancel it before booking a new one.",
          activeCount,
          limit: MAX_ACTIVE_BOOKINGS_PER_USER
        });
      }

      // v1.0.14: same code path as the /fares/quote endpoint via fare-config.
      // computeFareTotal() applies distance + vehicle + emergency + night
      // surcharges using the constants in services/api-server/src/fare-config.ts.
      const fareEstimate = computeFareTotal(
        data.pickupLat,
        data.pickupLng,
        data.dropLat,
        data.dropLng,
        "BLS",
        data.emergencyType
      );
      const { couponCode, discountInr, payableInr } = applyCoupon(fareEstimate, data.couponCode);

      // Per-ride OTP — 4 random digits the patient reads out to the driver
      // before pickup. New code per booking so a previous trip's OTP can't
      // be reused.
      const rideOtpCode = String(Math.floor(1000 + Math.random() * 9000));

      const isSos = data.isSos === true;

      const [created] = await db
        .insert(bookings)
        .values({
          userId: sub,
          emergencyType: data.emergencyType,
          pickupLat: data.pickupLat,
          pickupLng: data.pickupLng,
          pickupAddress: data.pickupAddress,
          dropLat: data.dropLat,
          dropLng: data.dropLng,
          dropAddress: data.dropAddress,
          fareEstimateInr: fareEstimate,
          couponCode,
          discountInr,
          payableInr,
          rideOtpCode,
          isSos
        })
        .returning();

      await db.insert(bookingEvents).values({
        bookingId: created.id,
        actor: `user:${sub}`,
        type: isSos ? "booking.created.sos" : "booking.created",
        payloadJson: JSON.stringify({ fareEstimate, couponCode, discountInr, payableInr, isSos })
      });

      if (isSos) {
        // v1.0.15: SOS skips the public dispatch fan-out. The cascade engine
        // (services/api-server/src/sos-cascade.ts) drives push-notifications
        // to drivers in waves, expanding by one nearest driver every 60s up
        // to a cap of 10. Drivers don't see SOS in their general Dashboard
        // pending list — only via the pushed SosIncomingModal.
        try {
          const { startCascade } = await import("../sos-cascade.js");
          startCascade(app, created.id);
        } catch (err) {
          // Fail-soft: if the cascade engine can't start (shouldn't happen),
          // log loudly and let ops handle it manually. The booking row is
          // already inserted so the patient sees a "looking for ambulance"
          // state and we can intervene out-of-band.
          app.log.error({ err, bookingId: created.id }, "[sos] cascade start failed");
        }
      } else {
        // Normal flow: existing socket fan-out so it appears on driver Dashboard.
        try {
          await fetch(`${config.socketBaseUrl}/internal/booking-created`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
            body: JSON.stringify({ bookingId: created.id })
          });
        } catch (err) {
          app.log.warn({ err }, "socket fan-out hint failed");
        }
        // v1.1.0 push: alert available drivers even if their app is
        // backgrounded/killed (the socket/poll only reaches a foregrounded
        // app). Best-effort broadcast to AVAILABLE, KYC-verified drivers.
        void (async () => {
          try {
            const avail = await db
              .select({ t: drivers.pushToken, lang: drivers.preferredLang })
              .from(drivers)
              .where(and(eq(drivers.status, "AVAILABLE"), eq(drivers.disabled, false), eq(drivers.kycVerified, true)));
            for (const d of avail) {
              if (!d.t) continue;
              const { title, body } = renderPushTemplate("booking_new", d.lang);
              void sendPush(d.t, title, body, { bookingId: created.id, kind: "booking" }, "booking_alerts");
            }
          } catch {
            /* best-effort */
          }
        })();
      }

      return reply.code(201).send({ booking: created });
    }
  );

  // Get one booking — must be the booking's user or assigned driver.
  // Includes the assigned driver's last known position so the user-app can
  // render the live driver marker even when the socket relay is asleep on
  // Render free-tier (the 5s booking poll becomes a hard floor for "where
  // is the ambulance"). Also returns a small `driverProfile` so the user
  // sees driver name + vehicle number on the live tracking card.
  app.get(
    "/api/v1/bookings/:id",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const id = req.params.id as string;
      const { sub, role } = req.user;
      const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
      if (!b) return reply.code(404).send({ error: "not_found" });
      if (role === "user" && b.userId !== sub) return reply.code(403).send({ error: "forbidden" });
      if (role === "driver" && b.driverId !== sub) return reply.code(403).send({ error: "forbidden" });

      let driverProfile = null;
      let driverPosition = null;
      if (b.driverId) {
        const [d] = await db.select().from(drivers).where(eq(drivers.id, b.driverId)).limit(1);
        if (d) {
          driverProfile = {
            id: d.id,
            name: d.name,
            phone: d.phone,
            vehicleNumber: d.vehicleNumber,
            vehicleType: d.vehicleType,
            rating: d.rating
          };
          if (d.lastLat != null && d.lastLng != null) {
            driverPosition = {
              lat: d.lastLat,
              lng: d.lastLng,
              lastSeenAt: d.lastSeenAt
            };
          }
        }
      }

      // userProfile carries the patient-facing contact info the *driver* needs
      // (name + phone for one-tap calling). Returned for both sides; the user
      // app already has its own profile so this is mostly noise there, but
      // including it unconditionally keeps the response shape consistent.
      // Note: this exposes patient *contact*, NOT medical fields — those
      // (patientCondition, patientNotes, paramedicAssessment) are returned
      // separately on the booking row and the driver app filters them out
      // per the visibility rule.
      let userProfile = null;
      if (b.userId) {
        const [u] = await db.select().from(users).where(eq(users.id, b.userId)).limit(1);
        if (u) {
          userProfile = {
            id: u.id,
            name: u.name,
            phone: u.phone
          };
        }
      }
      return reply.send({ booking: b, driverProfile, driverPosition, userProfile });
    }
  );

  // 2026-08-17 exploration (FLAG_GOOGLE_ETA_ENABLED, default off): traffic-aware
  // ETA for the live-tracking screen, additive alongside the apps' existing
  // client-side OSRM route (which has no live traffic — see CONTEXT.md line
  // 303). Not called by either app yet; built + auth-checked so it's ready to
  // wire in once reviewed. Same ownership check as GET /bookings/:id.
  // `available:false` (flag off, no driver position yet, or any Google API
  // failure) tells the caller to keep using its current OSRM-based ETA.
  app.get(
    "/api/v1/bookings/:id/live-eta",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const id = req.params.id as string;
      const { sub, role } = req.user;
      const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
      if (!b) return reply.code(404).send({ error: "not_found" });
      if (role === "user" && b.userId !== sub) return reply.code(403).send({ error: "forbidden" });
      if (role === "driver" && b.driverId !== sub) return reply.code(403).send({ error: "forbidden" });

      if (!config.googleLiveEtaEnabled || !b.driverId) {
        return reply.send({ available: false });
      }
      const [d] = await db.select().from(drivers).where(eq(drivers.id, b.driverId)).limit(1);
      if (!d || d.lastLat == null || d.lastLng == null) {
        return reply.send({ available: false });
      }
      // Before PICKED_UP the target is the pickup point (driver en route to
      // patient); dropLat/dropLng are only populated once the destination
      // hospital is auto-assigned at PICKED_UP (see schema.ts comment).
      const destLat = b.dropLat ?? b.pickupLat;
      const destLng = b.dropLng ?? b.pickupLng;
      const route = await getLiveRoute(d.lastLat, d.lastLng, destLat, destLng);
      if (!route) return reply.send({ available: false });
      return reply.send({ available: true, distanceKm: route.distanceKm, durationMin: route.durationMin });
    }
  );

  // List my bookings (user)
  app.get(
    "/api/v1/bookings/mine",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      const rows = await db
        .select()
        .from(bookings)
        .where(role === "user" ? eq(bookings.userId, sub) : eq(bookings.driverId, sub))
        .orderBy(desc(bookings.createdAt))
        .limit(50);
      return reply.send({ bookings: rows });
    }
  );

  // Pending bookings (driver dashboard fallback if socket connection drops).
  // v1.0.15: SOS bookings are intentionally excluded — they ride the cascade
  // engine and surface in the driver app via <SosIncomingModal /> rather
  // than the general pending list. Including them here would race with the
  // cascade and let any-online-driver tap-to-accept, defeating the nearest-
  // first dispatch logic.
  app.get(
    "/api/v1/bookings/pending",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const rows = await db
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.status, "REQUESTED"),
            isNull(bookings.driverId),
            eq(bookings.isSos, false)
          )
        )
        .orderBy(desc(bookings.createdAt))
        .limit(20);
      return reply.send({ bookings: rows });
    }
  );

  // Driver actions
  const driverActionSchemas = {
    accept: z.object({}),
    arrived: z.object({}),
    pickup: z.object({ code: z.string().regex(/^\d{4}$/, "OTP must be 4 digits") }),
    setDrop: z.object({
      dropLat: z.number(),
      dropLng: z.number(),
      dropAddress: z.string().max(500).optional()
    }),
    complete: z.object({ ratingByDriver: z.number().min(1).max(5).optional() }),
    cancel: z.object({ reason: z.string().max(200).optional() })
  };

  async function emitBookingEvent(
    bookingId: string,
    type: string,
    actor: string,
    payload?: unknown
  ) {
    await db.insert(bookingEvents).values({
      bookingId,
      actor,
      type,
      payloadJson: payload ? JSON.stringify(payload) : null
    });
    try {
      await fetch(`${config.socketBaseUrl}/internal/booking-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
        body: JSON.stringify({ bookingId, type, actor, payload })
      });
    } catch {
      /* swallow */
    }
  }

  // v1.2.0 (CR#3): fan a booking-lifecycle change out to the destination
  // hospital's portal room so it updates live. No-ops when the booking has
  // no destHospitalId yet (a hospital is only assigned at pickup, so accept/
  // arrived rides simply skip this). Additive — runs alongside the existing
  // /internal/booking-event emit, never replaces it.
  async function emitToHospital(booking: { id: string; destHospitalId: string | null }) {
    if (!booking.destHospitalId) return;
    try {
      await fetch(`${config.socketBaseUrl}/internal/emit-to-hospital`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
        body: JSON.stringify({
          hospitalId: booking.destHospitalId,
          event: "hospital:booking_update",
          payload: { bookingId: booking.id }
        })
      });
    } catch {
      /* swallow */
    }
  }

  app.post(
    "/api/v1/bookings/:id/accept",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = req.params.id as string;
      driverActionSchemas.accept.parse(req.body ?? {});
      // Block disabled drivers from picking up new trips. Existing in-flight
      // trips (already ACCEPTED) keep working — admin must call them out to
      // hand off, otherwise patients are left mid-ride.
      const [me] = await db.select().from(drivers).where(eq(drivers.id, sub)).limit(1);
      if (me?.disabled) {
        return reply.code(403).send({ error: "account_disabled", message: "This driver account has been disabled." });
      }
      // v1.0.11 KYC gate — drivers must be admin-verified before they can
      // pick up live bookings. Pre-existing drivers are grandfathered in
      // (kycVerified was false by default; admin needs to flip those).
      if (!me?.kycVerified) {
        return reply.code(403).send({
          error: "kyc_pending",
          message: "Your profile is under review. You'll receive ride requests once admin verifies your KYC."
        });
      }
      const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
      if (!b) return reply.code(404).send({ error: "not_found" });
      if (b.status !== "REQUESTED" || b.driverId)
        return reply.code(409).send({ error: "already_taken" });
      // Overlap guard (race-safe): the assignment succeeds ONLY IF this booking
      // is still up for grabs AND the accepting driver has no other active
      // assigned booking. Both conditions live in the same guarded UPDATE so a
      // second concurrent accept (the driver double-tapping, or a normal accept
      // racing an SOS accept) can never slip an overlapping ride through a
      // check-then-act gap. Covers BOTH normal and SOS accepts (same endpoint).
      const [updated] = await db
        .update(bookings)
        .set({ driverId: sub, status: "ACCEPTED", acceptedAt: new Date() })
        .where(
          and(
            eq(bookings.id, id),
            eq(bookings.status, "REQUESTED"),
            isNull(bookings.driverId),
            drizzleSql`NOT EXISTS (
              SELECT 1 FROM ${bookings} AS active_b
              WHERE active_b.driver_id = ${sub}
                AND active_b.status IN ('ACCEPTED','ARRIVED','PICKED_UP')
            )`
          )
        )
        .returning();
      if (!updated) {
        // The guarded UPDATE matched no row. Figure out which condition failed
        // so the driver app shows the right message. If the driver already
        // holds an active assigned booking, this is an overlap attempt; else
        // the booking was taken / left REQUESTED in the meantime.
        const [activeRow] = await db
          .select({ c: count() })
          .from(bookings)
          .where(
            and(
              eq(bookings.driverId, sub),
              drizzleSql`${bookings.status} IN ('ACCEPTED','ARRIVED','PICKED_UP')`
            )
          );
        if (Number(activeRow?.c ?? 0) > 0) {
          return reply.code(409).send({ error: "driver_on_active_ride" });
        }
        return reply.code(409).send({ error: "already_taken" });
      }
      await db
        .update(drivers)
        .set({ status: "ON_TRIP", updatedAt: new Date() })
        .where(eq(drivers.id, sub));
      await emitBookingEvent(id, "booking.accepted", `driver:${sub}`);
      await emitToHospital(updated);
      // v1.1.0 push: wake the patient even if their app is backgrounded.
      void pushToUser(updated.userId, "booking_assigned", {}, { bookingId: id, status: "ACCEPTED" });
      // Mark this driver's attempt row accepted (for SOS) + notify the
      // patient + dismiss losers' modals. Wrapped so a normal-flow accept
      // (not via cascade) still goes through cleanly.
      if (updated.isSos) {
        try {
          await db
            .update(sosDispatchAttempts)
            .set({ acceptedAt: new Date() })
            .where(
              and(
                eq(sosDispatchAttempts.bookingId, id),
                eq(sosDispatchAttempts.driverId, sub)
              )
            );
          const { stopCascade, notifyCascadeLosers } = await import("../sos-cascade.js");
          stopCascade(id);
          await notifyCascadeLosers(id, sub);
          // notifyCascadeLosers deliberately skips the winner (sub) — but the
          // winner's OWN device still has the original SOS push sitting in its
          // tray with the alarm-channel sound, which keeps ringing until it's
          // explicitly dismissed (accepting in-app only closes the JS modal,
          // it doesn't touch the OS notification that triggered it). Clear it
          // here so accepting actually silences the alert on the winner's phone.
          void dismissPushToDriver(sub, id);
          // Emit to the patient so LiveTrackingScreen flips out of the
          // "looking for ambulance" wait card.
          await fetch(`${config.socketBaseUrl}/internal/emit-to-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
            body: JSON.stringify({
              userId: updated.userId,
              event: "sos:assigned",
              payload: { bookingId: id }
            })
          });
        } catch (err) {
          app.log.warn({ err, bookingId: id }, "[sos] post-accept cleanup failed");
        }
      }
      return reply.send({ booking: updated });
    }
  );

  app.post(
    "/api/v1/bookings/:id/arrived",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = req.params.id as string;
      const [b] = await db
        .update(bookings)
        .set({ status: "ARRIVED", arrivedAt: new Date() })
        .where(and(eq(bookings.id, id), eq(bookings.driverId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
      await emitBookingEvent(id, "booking.arrived", `driver:${sub}`);
      await emitToHospital(b);
      void pushToUser(b.userId, "driver_arrived", {}, { bookingId: id, status: "ARRIVED" });
      return reply.send({ booking: b });
    }
  );

  app.post(
    "/api/v1/bookings/:id/pickup",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = req.params.id as string;
      const parsed = driverActionSchemas.pickup.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "otp_required", message: "Ask the patient for their 4-digit ride OTP." });
      }
      // Read the booking once so we can compare OTP without giving the
      // driver a way to brute-force via repeated 4xx responses (rate-limit
      // is global; this is just the per-request check).
      const [current] = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.driverId, sub)))
        .limit(1);
      if (!current) return reply.code(404).send({ error: "not_found_or_forbidden" });
      if (current.status !== "ARRIVED") {
        return reply.code(409).send({ error: "wrong_state", message: "Mark 'I have arrived' before verifying OTP." });
      }
      if (!current.rideOtpCode) {
        // Legacy booking created before the OTP column existed — let the
        // driver proceed without OTP. New bookings always carry one.
      } else if (current.rideOtpCode !== parsed.data.code) {
        return reply.code(401).send({ error: "otp_mismatch", message: "OTP didn't match. Ask the patient to read it again." });
      }
      // v1.1.0 (CR#3/#6): auto-assign the destination hospital at pickup.
      // In the current operational phase every ride goes to the single active
      // default hospital. We snapshot its coords into drop* so historical
      // bookings keep their destination even if the hospital row later moves,
      // and so the map/route code can read drop* uniformly. We only fill drop*
      // when the driver hasn't already set a manual drop (SOS /set-drop wins).
      let destPatch: Record<string, unknown> = {};
      try {
        const [hosp] = await db
          .select()
          .from(hospitals)
          .where(and(eq(hospitals.isDefault, true), eq(hospitals.active, true)))
          .limit(1);
        if (hosp) {
          destPatch = {
            destHospitalId: hosp.id,
            ...(current.dropLat == null || current.dropLng == null
              ? { dropLat: hosp.lat, dropLng: hosp.lng, dropAddress: hosp.name }
              : {})
          };
        }
      } catch (err) {
        app.log.warn({ err, bookingId: id }, "[pickup] hospital auto-assign skipped");
      }
      const [b] = await db
        .update(bookings)
        .set({ status: "PICKED_UP", pickedUpAt: new Date(), ...destPatch })
        .where(and(eq(bookings.id, id), eq(bookings.driverId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
      await emitBookingEvent(id, "booking.picked_up", `driver:${sub}`, {
        destHospitalId: destPatch.destHospitalId ?? null
      });
      await emitToHospital(b);
      // dropAddress omitted (not defaulted to English text here) when unset —
      // the template's own per-language fallback ("the hospital" / "अस्पताल") applies.
      void pushToUser(b.userId, "en_route_hospital", b.dropAddress ? { dropAddress: b.dropAddress } : {}, { bookingId: id, status: "PICKED_UP" });
      return reply.send({ booking: b });
    }
  );

  // SOS bookings often arrive with no drop hospital set yet — the driver
  // captures it on-site after assessing the patient. This endpoint lets the
  // assigned driver patch the drop coordinates + label any time before
  // PICKED_UP.
  app.post(
    "/api/v1/bookings/:id/set-drop",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = req.params.id as string;
      const parsed = driverActionSchemas.setDrop.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_drop", details: parsed.error.flatten() });
      }
      const [b] = await db
        .update(bookings)
        .set({
          dropLat: parsed.data.dropLat,
          dropLng: parsed.data.dropLng,
          dropAddress: parsed.data.dropAddress
        })
        .where(and(eq(bookings.id, id), eq(bookings.driverId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
      await emitBookingEvent(id, "booking.drop_set", `driver:${sub}`, {
        dropLat: parsed.data.dropLat,
        dropLng: parsed.data.dropLng,
        dropAddress: parsed.data.dropAddress
      });
      return reply.send({ booking: b });
    }
  );

  app.post(
    "/api/v1/bookings/:id/complete",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = req.params.id as string;
      const [b] = await db
        .update(bookings)
        .set({
          status: "COMPLETED",
          completedAt: new Date(),
          fareFinalInr: undefined
        })
        .where(and(eq(bookings.id, id), eq(bookings.driverId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
      // Fall back to the minimum-fare floor when the booking row never got
      // a quote (shouldn't happen post-v1.0.13 since /bookings POST always
      // calls computeFareTotal, but legacy rows from pre-1.0.13 carry null).
      const finalFare = b.fareEstimateInr ?? 300;
      // Recompute discount + payable against the final fare. If a coupon was
      // applied at creation the same rule runs again — covers the case where
      // base fare gets a future recompute hook between create and complete.
      const { discountInr, payableInr } = applyCoupon(finalFare, b.couponCode);
      // v1.0.15: normal flow (non-SOS) auto-marks paid at completion since
      // the patient saw + agreed to the fare upfront. SOS leaves paidAt NULL
      // so LiveTrackingScreen routes to PaymentScreen for the post-completion
      // coupon + Mark-paid flow.
      const autoPay = b.isSos
        ? {}
        : { paidInr: payableInr, paidAt: new Date(), paidCoupon: b.couponCode ?? null };
      await db
        .update(bookings)
        .set({ fareFinalInr: finalFare, discountInr, payableInr, ...autoPay })
        .where(eq(bookings.id, id));
      // v1.1.0 (CR#7): return the driver to AVAILABLE AND refresh lastSeenAt.
      // Without the lastSeenAt bump, the worker's 90s stale-reap could flip a
      // just-completed driver to OFFLINE before their Dashboard heartbeat
      // re-armed — silently dropping them from the SOS dispatch pool after a
      // few back-to-back rides. Bumping it here grants a fresh window each
      // trip; the re-armed heartbeat then keeps it fresh.
      await db
        .update(drivers)
        .set({ status: "AVAILABLE", lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(drivers.id, sub));
      await emitBookingEvent(id, "booking.completed", `driver:${sub}`, {
        finalFare,
        couponCode: b.couponCode,
        discountInr,
        payableInr
      });
      await emitToHospital(b);
      void pushToUser(b.userId, "trip_complete", {}, { bookingId: id, status: "COMPLETED" });
      // v1.2.8: the request is now dead. Silently clear any lingering "New SOS
      // request" tray notifications on the drivers who were pushed (losers whose
      // modal/tray never got dismissed, or the winner's own incoming-request
      // notification). No-op (FCM unset) and best-effort.
      if (b.isSos) {
        void (async () => {
          try {
            const attempts = await db
              .select({ driverId: sosDispatchAttempts.driverId })
              .from(sosDispatchAttempts)
              .where(eq(sosDispatchAttempts.bookingId, id));
            for (const a of attempts) void dismissPushToDriver(a.driverId, id);
          } catch {
            /* best-effort */
          }
        })();
      }
      // v1.3.1: the ride is over, so auto-resolve any still-ACTIVE safety alert
      // for it. Fire-and-forget so it never blocks the complete response.
      void autoResolveSafetyForBooking(id);
      return reply.send({ booking: { ...b, fareFinalInr: finalFare, discountInr, payableInr } });
    }
  );

  // Patient info collected after booking confirmation (team feedback 1.6).
  // Driver app only shows name/age/gender on the trip card; condition + notes
  // are admin-only so the driver focuses on driving and the hospital can be
  // prepared via the dashboard.
  const patientInfoSchema = z.object({
    patientName: z.string().max(120).optional(),
    patientAge: z.number().int().min(0).max(130).optional(),
    patientGender: z.enum(["M", "F", "O"]).optional(),
    // 2026-08-12: multi-select — a patient can be e.g. both "Road Accident"
    // AND "Severe Bleeding". patientCondition (single string) kept accepted
    // for any client not yet updated; the app now sends patientConditions.
    patientCondition: z.string().max(80).optional(),
    patientConditions: z.array(z.string().max(80)).min(1).max(15).optional(),
    patientNotes: z.string().max(500).optional()
  });

  app.post(
    "/api/v1/bookings/:id/patient-info",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user") return reply.code(403).send({ error: "user_only" });
      const id = req.params.id as string;
      const parsed = patientInfoSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      // v1.1.0 (CR#9a): the patient can edit medical details only until the
      // ambulance reaches them. At ARRIVED the info is locked + Receipt A is
      // effectively final, so the hospital sees a stable record in transit.
      const [current] = await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.userId, sub)))
        .limit(1);
      if (!current) return reply.code(404).send({ error: "not_found_or_forbidden" });
      if (["ARRIVED", "PICKED_UP", "COMPLETED", "CANCELLED"].includes(current.status)) {
        return reply.code(409).send({
          error: "patient_info_locked",
          message: "Medical details are locked once the ambulance has arrived."
        });
      }
      const [b] = await db
        .update(bookings)
        .set(parsed.data)
        .where(and(eq(bookings.id, id), eq(bookings.userId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
      await emitBookingEvent(id, "booking.patient_info_captured", `user:${sub}`, {
        condition: parsed.data.patientConditions ?? parsed.data.patientCondition
      });
      return reply.send({ booking: b });
    }
  );

  // Paramedic assessment recorded by the driver after arrival (team 1.7).
  // Stored as JSONB so we iterate without a migration per field. Admin-only
  // visibility — the driver's own dashboard surfaces nothing back.
  const paramedicSchema = z.object({
    consciousness: z.enum(["alert", "responsive_to_voice", "responsive_to_pain", "unconscious"]).optional(),
    breathing: z.enum(["normal", "laboured", "shallow", "absent"]).optional(),
    pulse: z.enum(["normal", "weak", "rapid", "absent"]).optional(),
    bloodPressureSystolic: z.number().int().min(40).max(260).optional(),
    bloodPressureDiastolic: z.number().int().min(20).max(160).optional(),
    oxygenSaturation: z.number().int().min(40).max(100).optional(),
    visibleInjury: z.enum(["none", "minor", "moderate", "severe"]).optional(),
    bleedingSeverity: z.enum(["none", "minor", "moderate", "severe"]).optional(),
    burnEstimatePct: z.number().int().min(0).max(100).optional(),
    suspectedFracture: z.boolean().optional(),
    snakeBiteVisible: z.boolean().optional(),
    pregnancyMonths: z.number().int().min(0).max(10).optional(),
    seizureActivity: z.boolean().optional(),
    immediateRisk: z.boolean().optional(),
    notes: z.string().max(1000).optional(),
    // CR7 (2026-08): Pregnancy Assessment sub-section, gated on pregnancyStatus.
    pregnancyStatus: z.enum(["yes", "no", "unknown"]).optional(),
    pregnancyParity: z.enum(["first", "second", "third", "fourth_or_more"]).optional(),
    pregnancyComplaints: z
      .array(
        z.enum([
          "leaking_fluid",
          "vaginal_bleeding",
          "severe_abdominal_pain",
          "excessive_vomiting",
          "reduced_movements",
          "seizures",
          "high_fever",
          "other"
        ])
      )
      .optional(),
    pregnancyComplaintOther: z.string().max(200).optional(),
    pregnancyAdditionalComplaint: z.string().max(500).optional()
  });

  app.post(
    "/api/v1/bookings/:id/paramedic-assessment",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = req.params.id as string;
      const parsed = paramedicSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const assessment = { ...parsed.data, recordedAt: new Date().toISOString(), recordedBy: sub };
      const [b] = await db
        .update(bookings)
        .set({ paramedicAssessment: assessment as any })
        .where(and(eq(bookings.id, id), eq(bookings.driverId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
      await emitBookingEvent(id, "booking.paramedic_assessment", `driver:${sub}`, {
        immediateRisk: parsed.data.immediateRisk ?? false
      });
      await emitToHospital(b);
      return reply.send({ booking: b });
    }
  );

  // Rating — user rates driver. Same body schema as the driver-rates-user
  // endpoint below; the only difference is which booking column gets set
  // and which side's running-average gets recomputed.
  const rateSchema = z.object({
    rating: z.number().int().min(1).max(5),
    feedback: z.string().max(500).optional()
  });

  /**
   * Recompute a running average rating given the previous (avg, count) and
   * the newly-submitted value. Server-side so we don't trust client-sent
   * averages and so partial network failures can't poison the average.
   * Returns the new (avg, count).
   */
  function nextRunningAvg(prevAvg: number, prevCount: number, newRating: number): { avg: number; count: number } {
    const count = prevCount + 1;
    const avg = (prevAvg * prevCount + newRating) / count;
    return { avg: Number(avg.toFixed(3)), count };
  }

  app.post(
    "/api/v1/bookings/:id/rate",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user") return reply.code(403).send({ error: "user_only" });
      const id = req.params.id as string;
      const parsed = rateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      // Read first so we know the driver to update.
      const [existing] = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.userId, sub)))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "not_found_or_forbidden" });
      if (existing.rating) {
        return reply.code(409).send({ error: "already_rated", message: "You've already rated this trip." });
      }
      const [b] = await db
        .update(bookings)
        .set({ rating: parsed.data.rating, feedback: parsed.data.feedback })
        .where(eq(bookings.id, id))
        .returning();
      // Recompute driver's running average + bump count.
      if (existing.driverId) {
        const [d] = await db.select().from(drivers).where(eq(drivers.id, existing.driverId)).limit(1);
        if (d) {
          const { avg, count } = nextRunningAvg(d.rating ?? 5, d.ratingCount ?? 0, parsed.data.rating);
          await db
            .update(drivers)
            .set({ rating: avg, ratingCount: count, updatedAt: new Date() })
            .where(eq(drivers.id, d.id));
        }
      }
      return reply.send({ booking: b });
    }
  );

  // Driver rates the patient (v1.0.11.3). Mirror of /rate. Either side
  // rates exactly once per trip; the 409 already_rated gate prevents
  // double-counting in the running average.
  app.post(
    "/api/v1/bookings/:id/rate-by-driver",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = req.params.id as string;
      const parsed = rateSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      const [existing] = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.driverId, sub)))
        .limit(1);
      if (!existing) return reply.code(404).send({ error: "not_found_or_forbidden" });
      if (existing.ratingByDriver) {
        return reply.code(409).send({ error: "already_rated", message: "You've already rated this patient." });
      }
      const [b] = await db
        .update(bookings)
        .set({ ratingByDriver: parsed.data.rating, feedbackByDriver: parsed.data.feedback })
        .where(eq(bookings.id, id))
        .returning();
      // Recompute the patient's running average + count.
      if (existing.userId) {
        const [u] = await db.select().from(users).where(eq(users.id, existing.userId)).limit(1);
        if (u) {
          const { avg, count } = nextRunningAvg(u.rating ?? 5, u.ratingCount ?? 0, parsed.data.rating);
          await db
            .update(users)
            .set({ rating: avg, ratingCount: count, updatedAt: new Date() })
            .where(eq(users.id, u.id));
        }
      }
      return reply.send({ booking: b });
    }
  );

  // v1.0.15: post-completion payment for SOS rides.
  //
  // SOS bookings come through without a coupon/payment screen up front
  // (patient is in a hurry). At the end of the ride the patient sees a
  // PaymentScreen with the full fare breakdown + coupon entry. Tapping
  // "Mark paid · finish" hits this endpoint.
  //
  // Idempotent: a second call with the same booking returns the existing
  // payment shape instead of 409 — covers the case where the user app gets
  // force-killed mid-network and replays the request on next launch.
  //
  // Normal flow (Book Ambulance) auto-marks paid at booking creation since
  // the patient already saw and agreed to the fare upfront. The auto-mark
  // happens in the POST /bookings handler above.
  const markPaidSchema = z.object({
    couponCode: z.string().max(40).optional().nullable()
  });
  app.post(
    "/api/v1/bookings/:id/mark-paid",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user") return reply.code(403).send({ error: "user_only" });
      const id = req.params.id as string;
      const parsed = markPaidSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const [existing] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
      if (!existing) return reply.code(404).send({ error: "not_found" });
      if (existing.userId !== sub) return reply.code(403).send({ error: "forbidden" });
      // Idempotent — return the existing payment shape if already paid.
      if (existing.paidAt) {
        return reply.send({
          booking: existing,
          paid: {
            inr: existing.paidInr ?? 0,
            at: existing.paidAt,
            coupon: existing.paidCoupon ?? null
          }
        });
      }
      if (existing.status !== "COMPLETED") {
        return reply.code(409).send({
          error: "wrong_state",
          message: "Trip isn't complete yet. Wait for the driver to mark it complete."
        });
      }
      // Recompute discount + payable against the booking's final fare. Coupon
      // can come from this POST OR fall back to whatever was on the booking
      // already (normal flow stored it at creation).
      const finalFare = existing.fareFinalInr ?? existing.fareEstimateInr ?? 300;
      const coupon = parsed.data.couponCode ?? existing.couponCode ?? null;
      const { couponCode: appliedCoupon, discountInr, payableInr } = applyCoupon(finalFare, coupon);
      const now = new Date();
      const [updated] = await db
        .update(bookings)
        .set({
          paidInr: payableInr,
          paidAt: now,
          paidCoupon: appliedCoupon,
          // Sync coupon/discount/payable on the booking too so admin's fare
          // breakdown shows what the patient actually saw.
          couponCode: appliedCoupon,
          discountInr,
          payableInr
        })
        .where(eq(bookings.id, id))
        .returning();
      await emitBookingEvent(id, "booking.paid", `user:${sub}`, {
        paidInr: payableInr,
        couponCode: appliedCoupon,
        discountInr
      });
      return reply.send({
        booking: updated,
        paid: { inr: payableInr, at: now, coupon: appliedCoupon },
        breakdown: { finalFare, couponCode: appliedCoupon, discountInr, payableInr }
      });
    }
  );

  // v1.0.15: SOS cascade rejection. The driver app's <SosIncomingModal />
  // calls this when the driver taps "Reject" on a pushed SOS request. The
  // cascade engine reads sos_dispatch_attempts.rejected_at on each wave and
  // skips drivers that have already rejected — they don't get re-prompted
  // as the cascade widens.
  //
  // Unlike /accept this does NOT change the booking row (the cascade may
  // still find another driver). It only updates the audit row. If no attempt
  // row exists (driver wasn't actually pushed), returns 409.
  app.post(
    "/api/v1/bookings/:id/reject",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = req.params.id as string;
      const [updated] = await db
        .update(sosDispatchAttempts)
        .set({ rejectedAt: new Date() })
        .where(
          and(
            eq(sosDispatchAttempts.bookingId, id),
            eq(sosDispatchAttempts.driverId, sub),
            // Don't overwrite an existing accept (race guard) or rejection
            // (second tap should be a no-op idempotent).
            drizzleSql`${sosDispatchAttempts.acceptedAt} IS NULL`
          )
        )
        .returning();
      if (!updated) {
        return reply.code(409).send({
          error: "no_active_dispatch",
          message: "This SOS isn't pending for you anymore."
        });
      }
      // Update the in-memory cascade state so the next wave skips this
      // driver. If the cascade isn't running in this process (e.g. after a
      // restart and resumeOnBoot hasn't picked up the booking yet), this is
      // a no-op — the DB rejected_at flag is authoritative.
      try {
        const { noteCascadeReject } = await import("../sos-cascade.js");
        noteCascadeReject(id, sub);
      } catch {
        /* ignore — DB row is the truth */
      }
      await emitBookingEvent(id, "sos.rejected", `driver:${sub}`, {
        waveNumber: updated.waveNumber
      });
      return reply.send({ ok: true });
    }
  );

  // Cancel — user can cancel their own; driver can cancel only the trip they're assigned to.
  app.post(
    "/api/v1/bookings/:id/cancel",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      const id = req.params.id as string;
      const [existing] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
      if (!existing) return reply.code(404).send({ error: "not_found" });
      if (role === "user" && existing.userId !== sub)
        return reply.code(403).send({ error: "forbidden" });
      if (role === "driver" && existing.driverId !== sub)
        return reply.code(403).send({ error: "forbidden" });
      if (!["REQUESTED", "ACCEPTED", "ARRIVED"].includes(existing.status))
        return reply.code(409).send({ error: "cannot_cancel" });
      const [b] = await db
        .update(bookings)
        .set({ status: "CANCELLED", cancelledAt: new Date() })
        .where(eq(bookings.id, id))
        .returning();
      if (existing.driverId) {
        await db
          .update(drivers)
          .set({ status: "AVAILABLE", updatedAt: new Date() })
          .where(eq(drivers.id, existing.driverId));
      }
      // Patient cancelling mid-cascade — stop the timer and dismiss any
      // pushed driver modals so nobody chases a dead booking. notifyCascadeLosers
      // (v1.2.8) also fires a silent dismissPush to every pushed driver so a
      // backgrounded/killed driver's tray "New SOS request" clears too.
      if (existing.isSos) {
        try {
          const { stopCascade, notifyCascadeLosers } = await import("../sos-cascade.js");
          stopCascade(id);
          await notifyCascadeLosers(id, /* winner */ "");
        } catch {
          /* best-effort */
        }
      }
      // v1.2.8: clear the patient's own tray notification for this dead booking
      // (e.g. a lingering "Ambulance assigned" push) so it can't be tapped into
      // a cancelled ride. Best-effort, no-op when FCM is unset.
      void dismissPushToUser(existing.userId, id);
      // v1.3.1: the ride is cancelled, so auto-resolve any still-ACTIVE safety
      // alert for it. Fire-and-forget so it never blocks the cancel response.
      void autoResolveSafetyForBooking(id);
      await emitBookingEvent(id, "booking.cancelled", `${role}:${sub}`);
      await emitToHospital(b);
      return reply.send({ booking: b });
    }
  );

  // Driver location push (used by driver app every 5s while on trip)
  const locationSchema = z.object({
    bookingId: z.string().uuid().optional(),
    lat: z.number(),
    lng: z.number(),
    speedKmh: z.number().optional(),
    headingDeg: z.number().optional()
  });

  app.post(
    "/api/v1/driver/location",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const parsed = locationSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      // If the driver tagged a bookingId, verify they own it. Without this any
      // driver could spoof another driver's live location stream to a patient.
      if (parsed.data.bookingId) {
        const [b] = await db.select().from(bookings).where(eq(bookings.id, parsed.data.bookingId)).limit(1);
        if (!b || b.driverId !== sub) {
          return reply.code(403).send({ error: "not_assigned_to_booking" });
        }
      }
      await db.insert(driverLocations).values({
        driverId: sub,
        bookingId: parsed.data.bookingId,
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        speedKmh: parsed.data.speedKmh,
        headingDeg: parsed.data.headingDeg
      });
      await db
        .update(drivers)
        .set({
          lastLat: parsed.data.lat,
          lastLng: parsed.data.lng,
          lastSeenAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(drivers.id, sub));
      return reply.send({ ok: true });
    }
  );
}
