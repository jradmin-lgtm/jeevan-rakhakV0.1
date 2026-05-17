import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, isNull, sql as drizzleSql } from "drizzle-orm";
import { db, bookingEvents, bookings, driverLocations, drivers, users } from "@jr/db";

// Pilot cap: any single user may hold only 1 active (un-terminal) booking at
// a time. The earlier value of 3 confused testers — they'd dispatch a second
// ambulance while the first was still en route. One ride at a time matches
// real-world emergency dispatch and avoids resource waste.
const MAX_ACTIVE_BOOKINGS_PER_USER = 1;
import { config } from "@jr/config";
import { haversineDistanceKm } from "@jr/utils";

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
  couponCode: z.string().max(40).optional()
});

function estimateFare(pickupLat: number, pickupLng: number, dropLat?: number, dropLng?: number) {
  if (dropLat == null || dropLng == null) return config.baseFareInr;
  const km = haversineDistanceKm(pickupLat, pickupLng, dropLat, dropLng);
  return Math.round(config.baseFareInr + km * config.perKmFareInr);
}

/**
 * Coupon registry — pilot uses a single 100%-off launch promo. When more
 * coupons land or rules grow (per-user limits, expiry, max uses), promote
 * this to a `coupons` table + admin CRUD. Until then the constant is enough.
 */
const COUPONS: Record<string, { percentOff: number; flatOffInr: number }> = {
  PILOT100: { percentOff: 100, flatOffInr: 0 }
};

function applyCoupon(baseFareInr: number, rawCode: string | undefined | null) {
  if (!rawCode) return { couponCode: null as string | null, discountInr: 0, payableInr: baseFareInr };
  const code = rawCode.trim().toUpperCase();
  const promo = COUPONS[code];
  if (!promo) {
    // Unknown coupons are treated as "no coupon applied" — we keep the request
    // succeeding so a fat-fingered code doesn't block the booking, but the
    // patient pays full fare. The user app validates coupons before submit so
    // we typically only see codes we know.
    return { couponCode: null as string | null, discountInr: 0, payableInr: baseFareInr };
  }
  const pctDiscount = Math.round((baseFareInr * promo.percentOff) / 100);
  const discountInr = Math.min(baseFareInr, pctDiscount + promo.flatOffInr);
  const payableInr = Math.max(0, baseFareInr - discountInr);
  return { couponCode: code, discountInr, payableInr };
}

export async function registerBookingRoutes(app: FastifyInstance) {
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

      const fareEstimate = estimateFare(
        data.pickupLat,
        data.pickupLng,
        data.dropLat,
        data.dropLng
      );
      const { couponCode, discountInr, payableInr } = applyCoupon(fareEstimate, data.couponCode);

      // Per-ride OTP — 4 random digits the patient reads out to the driver
      // before pickup. New code per booking so a previous trip's OTP can't
      // be reused.
      const rideOtpCode = String(Math.floor(1000 + Math.random() * 9000));

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
          rideOtpCode
        })
        .returning();

      await db.insert(bookingEvents).values({
        bookingId: created.id,
        actor: `user:${sub}`,
        type: "booking.created",
        payloadJson: JSON.stringify({ fareEstimate, couponCode, discountInr, payableInr })
      });

      // Notify socket-server out-of-band so dispatch fan-out begins immediately.
      // Best-effort; if socket server is down the worker also picks pending bookings.
      try {
        await fetch(`${config.socketBaseUrl}/internal/booking-created`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
          body: JSON.stringify({ bookingId: created.id })
        });
      } catch (err) {
        app.log.warn({ err }, "socket fan-out hint failed");
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

  // Pending bookings (driver dashboard fallback if socket connection drops)
  app.get(
    "/api/v1/bookings/pending",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const rows = await db
        .select()
        .from(bookings)
        .where(and(eq(bookings.status, "REQUESTED"), isNull(bookings.driverId)))
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
      const [updated] = await db
        .update(bookings)
        .set({ driverId: sub, status: "ACCEPTED", acceptedAt: new Date() })
        .where(eq(bookings.id, id))
        .returning();
      await db
        .update(drivers)
        .set({ status: "ON_TRIP", updatedAt: new Date() })
        .where(eq(drivers.id, sub));
      await emitBookingEvent(id, "booking.accepted", `driver:${sub}`);
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
      const [b] = await db
        .update(bookings)
        .set({ status: "PICKED_UP", pickedUpAt: new Date() })
        .where(and(eq(bookings.id, id), eq(bookings.driverId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
      await emitBookingEvent(id, "booking.picked_up", `driver:${sub}`);
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
      const finalFare = b.fareEstimateInr ?? config.baseFareInr;
      // Recompute discount + payable against the final fare. If a coupon was
      // applied at creation the same rule runs again — covers the case where
      // base fare gets a future recompute hook between create and complete.
      const { discountInr, payableInr } = applyCoupon(finalFare, b.couponCode);
      await db
        .update(bookings)
        .set({ fareFinalInr: finalFare, discountInr, payableInr })
        .where(eq(bookings.id, id));
      await db
        .update(drivers)
        .set({ status: "AVAILABLE", updatedAt: new Date() })
        .where(eq(drivers.id, sub));
      await emitBookingEvent(id, "booking.completed", `driver:${sub}`, {
        finalFare,
        couponCode: b.couponCode,
        discountInr,
        payableInr
      });
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
    patientCondition: z.string().max(80).optional(),
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
      const [b] = await db
        .update(bookings)
        .set(parsed.data)
        .where(and(eq(bookings.id, id), eq(bookings.userId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
      await emitBookingEvent(id, "booking.patient_info_captured", `user:${sub}`, {
        condition: parsed.data.patientCondition
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
    notes: z.string().max(1000).optional()
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
      await emitBookingEvent(id, "booking.cancelled", `${role}:${sub}`);
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
