import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, isNull, sql as drizzleSql } from "drizzle-orm";
import {
  db,
  bookings,
  bookingCancellations,
  drivers,
  driverHeartbeats,
  driverHospitals,
  sosDispatchAttempts,
  sql as pgClient
} from "@jr/db";
import { config } from "@jr/config";
import { dismissPushToDriver, pushToUser } from "../push";
import { redispatchBooking } from "../redispatch";

const availabilitySchema = z.object({
  status: z.enum(["OFFLINE", "AVAILABLE", "ON_TRIP"]),
  lat: z.number().optional(),
  lng: z.number().optional()
});

// KYC submission — driver fills these during onboarding (team feedback 1.10).
// All fields optional individually but the driver app validates completeness
// client-side before letting them tap submit. File uploads (driver photo,
// licence scan, RC scan, insurance scan) are deferred to v1.0.12 when blob
// storage lands — for v1.0.11 we collect the numbers only and admin verifies
// out-of-band against physical documents.
const kycSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  photoUrl: z.string().max(500).optional(),
  vehicleNumber: z.string().min(4).max(20).optional(),
  vehicleType: z.string().max(40).optional(),
  licenseNumber: z.string().min(4).max(40).optional(),
  rcNumber: z.string().min(4).max(40).optional(),
  insuranceNumber: z.string().min(4).max(60).optional(),
  hospitalId: z.string().max(60).optional(),
  hospitalName: z.string().max(200).optional()
});

export async function registerDriverRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/driver/availability",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const parsed = availabilitySchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      const { status, lat, lng } = parsed.data;
      const [d] = await db
        .update(drivers)
        .set({
          status,
          lastLat: lat,
          lastLng: lng,
          lastSeenAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(drivers.id, sub))
        .returning();
      return reply.send({ driver: d });
    }
  );

  // v1.0.15: "online" heartbeat. Driver app POSTs every 60s while toggled
  // online AND foregrounded. Upserts into driver_heartbeats so the SOS
  // cascade engine can pick the nearest available drivers without depending
  // on the trip-time location stream (which only fires during an active ride).
  // Returns 204 — body-less, intentional: this is a high-frequency poll, no
  // payload to negotiate.
  const heartbeatSchema = z.object({
    lat: z.number(),
    lng: z.number()
  });
  app.post(
    "/api/v1/driver/heartbeat",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const parsed = heartbeatSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      await db
        .insert(driverHeartbeats)
        .values({
          driverId: sub,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: driverHeartbeats.driverId,
          set: {
            lat: parsed.data.lat,
            lng: parsed.data.lng,
            updatedAt: new Date()
          }
        });
      // Also keep drivers.lastLat / lastLng / lastSeenAt fresh so admin's
      // existing "where is the driver" UI keeps working without a second
      // ping path. Doesn't change behavior of trip-time GPS pushes.
      await db
        .update(drivers)
        .set({
          lastLat: parsed.data.lat,
          lastLng: parsed.data.lng,
          lastSeenAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(drivers.id, sub));
      return reply.code(204).send();
    }
  );

  // v1.1.0 (CR#4): polling fallback for SOS dispatch. The driver app polls
  // this on the same tick as /bookings/pending. Returns the SOS bookings this
  // driver was pushed by the cascade (an attempt row exists) that are still
  // REQUESTED + unassigned + not rejected by this driver. This survives a
  // cold/sleeping socket-server or a dropped `sos:incoming` emit — the #1
  // reason SOS requests silently never reached drivers before. Payload shape
  // mirrors the `sos:incoming` socket event so the app feeds both into the
  // same SosIncomingModal path.
  //
  // v1.2.0 (CR#1): DEPRECATED — superseded by GET /driver/incoming (unified
  // SOS + normal queue). Kept as an alias so currently-deployed v1.1 APKs keep
  // working during rollout; do NOT delete until all clients are upgraded.
  app.get(
    "/api/v1/driver/sos-pending",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const rows = await db
        .select({ booking: bookings, attempt: sosDispatchAttempts })
        .from(sosDispatchAttempts)
        .innerJoin(bookings, eq(bookings.id, sosDispatchAttempts.bookingId))
        .where(
          and(
            eq(sosDispatchAttempts.driverId, sub),
            isNull(sosDispatchAttempts.rejectedAt),
            isNull(sosDispatchAttempts.acceptedAt),
            eq(bookings.status, "REQUESTED"),
            isNull(bookings.driverId),
            eq(bookings.isSos, true)
          )
        )
        .orderBy(desc(sosDispatchAttempts.pushedAt))
        .limit(5);
      const sos = rows.map((r) => ({
        bookingId: r.booking.id,
        emergencyType: r.booking.emergencyType,
        pickupLat: r.booking.pickupLat,
        pickupLng: r.booking.pickupLng,
        pickupAddress: r.booking.pickupAddress,
        distanceKm: r.attempt.distanceKm,
        waveNumber: r.attempt.waveNumber
      }));
      return reply.send({ sos });
    }
  );

  // v1.2.0 (CR#1): unified incoming-request queue. Returns BOTH the SOS
  // bookings the cascade pushed to THIS driver (still REQUESTED, not rejected
  // by them) AND the open normal broadcast bookings (REQUESTED, non-SOS, no
  // driver yet), each tagged with `is_sos`. This is the single source of truth
  // the Dashboard polls so SOS and normal requests share one list and neither
  // can silently overwrite the other. Supersedes /driver/sos-pending.
  app.get(
    "/api/v1/driver/incoming",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      // SOS requests dispatched to THIS driver, still open, not rejected by them.
      const sosRows = await pgClient`
        SELECT b.id, b.display_id, b.emergency_type, b.pickup_lat, b.pickup_lng,
               b.pickup_address, b.patient_name, b.created_at, true AS is_sos
        FROM bookings b
        JOIN sos_dispatch_attempts a ON a.booking_id = b.id AND a.driver_id = ${sub}
        WHERE b.status = 'REQUESTED' AND a.rejected_at IS NULL
        ORDER BY b.created_at DESC
      `;
      // Normal broadcast bookings still open (no driver yet).
      const normalRows = await pgClient`
        SELECT b.id, b.display_id, b.emergency_type, b.pickup_lat, b.pickup_lng,
               b.pickup_address, b.patient_name, b.created_at, false AS is_sos
        FROM bookings b
        WHERE b.status = 'REQUESTED' AND b.is_sos = false AND b.driver_id IS NULL
        ORDER BY b.created_at DESC
        LIMIT 50
      `;
      return reply.send({ requests: [...sosRows, ...normalRows] });
    }
  );

  // v1.2.0 (CR#2): driver-initiated cancellation. Two reason buckets:
  //  - PATIENT_* → server-gated wait window then CLOSE the booking (patient
  //    didn't show / didn't respond); no re-dispatch.
  //  - VEHICLE/OP/OTHER → free THIS driver and RE-DISPATCH to the next
  //    ambulance via the same path a fresh booking uses.
  const PATIENT_REASONS = new Set(["PATIENT_NOT_AVAILABLE", "PATIENT_NOT_RESPONDING"]);
  const VEHICLE_OR_OP_REASONS = new Set(["VEHICLE_BREAKDOWN", "TYRE_PUNCTURE", "CANNOT_REACH_PICKUP"]);

  // Patient-reason wait-start: anchors the server-authoritative wait clock so
  // the client countdown can't be gamed. Idempotent — repeated taps don't reset
  // an already-running clock.
  app.post(
    "/api/v1/driver/bookings/:id/cancel/start-wait",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const bookingId = req.params.id;
      const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
      if (!b || b.driverId !== sub) return reply.code(404).send({ error: "not_found" });
      if (!(b.status === "ACCEPTED" || b.status === "ARRIVED")) {
        return reply.code(409).send({ error: "not_cancellable" });
      }
      // Anchor the wait clock once; idempotent so repeated taps don't reset it.
      let startedAt = b.cancelWaitStartedAt as Date | null;
      if (!startedAt) {
        startedAt = new Date();
        await db
          .update(bookings)
          .set({ cancelWaitStartedAt: startedAt })
          .where(eq(bookings.id, bookingId));
      }
      return reply.send({ waitStartedAt: startedAt, waitSeconds: config.driverCancelPatientWaitS });
    }
  );

  app.post(
    "/api/v1/driver/bookings/:id/cancel",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const bookingId = req.params.id;
      const reasonCode = String(req.body?.reasonCode ?? "");
      const remarks = req.body?.remarks ? String(req.body.remarks) : null;

      const validReasons = new Set([...PATIENT_REASONS, ...VEHICLE_OR_OP_REASONS, "OTHER"]);
      if (!validReasons.has(reasonCode)) return reply.code(400).send({ error: "invalid_reason" });
      if (reasonCode === "OTHER" && (!remarks || remarks.trim().length < 10)) {
        return reply.code(400).send({ error: "remarks_required" });
      }

      const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
      if (!b || b.driverId !== sub) return reply.code(404).send({ error: "not_found" });
      if (!(b.status === "ACCEPTED" || b.status === "ARRIVED")) {
        return reply.code(409).send({ error: "not_cancellable" }); // PICKED_UP+ is admin-only
      }

      // Patient-reason wait gate (server-authoritative).
      if (PATIENT_REASONS.has(reasonCode)) {
        const startedAt = (b.cancelWaitStartedAt as Date | null) ?? (b.arrivedAt as Date | null);
        const elapsed = startedAt ? (Date.now() - new Date(startedAt).getTime()) / 1000 : 0;
        if (elapsed < config.driverCancelPatientWaitS) {
          return reply.code(425).send({
            error: "cancel_wait_not_elapsed",
            remainingS: Math.ceil(config.driverCancelPatientWaitS - elapsed)
          });
        }
      }

      const outcome = PATIENT_REASONS.has(reasonCode) ? "CLOSED" : "RE_DISPATCHED";

      // Audit log first (always).
      await db.insert(bookingCancellations).values({ bookingId, driverId: sub, reasonCode, remarks, outcome });

      if (outcome === "CLOSED") {
        await db
          .update(bookings)
          .set({ status: "CANCELLED", cancelledAt: new Date(), cancelWaitStartedAt: null })
          .where(eq(bookings.id, bookingId));
        await db
          .update(drivers)
          .set({ status: "AVAILABLE", updatedAt: new Date() })
          .where(eq(drivers.id, sub));
        const msg =
          reasonCode === "PATIENT_NOT_AVAILABLE"
            ? "The ambulance driver was unable to locate you at the pickup location. Please create a new request if assistance is still required."
            : "Your booking was closed because we couldn't reach you. Please create a new request if assistance is still required.";
        // Patient push + socket toast — mirrors the /complete handler's
        // fire-and-forget pushToUser + the SOS-assign emit-to-user fan-out.
        void pushToUser(b.userId, "Booking closed", msg, { bookingId, status: "CANCELLED" });
        await fetch(`${config.socketBaseUrl}/internal/emit-to-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
          body: JSON.stringify({
            userId: b.userId,
            event: "booking:cancelled",
            payload: { bookingId, message: msg }
          })
        }).catch(() => {});
      } else {
        // Vehicle / operational / Other → free THIS driver, put booking back to dispatch.
        await db
          .update(drivers)
          .set({ status: "AVAILABLE", updatedAt: new Date() })
          .where(eq(drivers.id, sub));
        const msg =
          "The assigned ambulance is unable to continue due to a vehicle issue. We are searching for another available ambulance.";
        void pushToUser(b.userId, "Reassigning ambulance", msg, { bookingId, status: "REQUESTED" });
        await fetch(`${config.socketBaseUrl}/internal/emit-to-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
          body: JSON.stringify({
            userId: b.userId,
            event: "booking:reassigning",
            payload: { bookingId, message: msg }
          })
        }).catch(() => {});
        await redispatchBooking(app, bookingId, sub);
      }

      // v1.2.8: the ride just closed or got re-dispatched, so any tray
      // notifications the prior recipients still hold for THIS booking point at
      // a dead/stale offer. Silently clear them: always the cancelling driver's
      // own incoming-request notification, plus (for SOS) every driver the
      // cascade pushed. Best-effort + no-op when FCM is unset.
      void dismissPushToDriver(sub, bookingId);
      if (b.isSos) {
        void (async () => {
          try {
            const attempts = await db
              .select({ driverId: sosDispatchAttempts.driverId })
              .from(sosDispatchAttempts)
              .where(eq(sosDispatchAttempts.bookingId, bookingId));
            for (const a of attempts) {
              if (a.driverId !== sub) void dismissPushToDriver(a.driverId, bookingId);
            }
          } catch {
            /* best-effort */
          }
        })();
      }

      // Drive the patient's LiveTrackingScreen state live: it subscribes to the
      // booking room and refetches on `booking:event`. The emit-to-user events
      // above carry the friendly toast; this one makes the screen reflect the
      // new status (CANCELLED / back to REQUESTED) without waiting for the poll.
      await fetch(`${config.socketBaseUrl}/internal/booking-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
        body: JSON.stringify({
          bookingId,
          type: outcome === "CLOSED" ? "booking.cancelled" : "booking.reassigning"
        })
      }).catch(() => {});

      return reply.send({ ok: true, outcome });
    }
  );

  app.post(
    "/api/v1/driver/kyc",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const parsed = kycSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      // Driver submits — flag never auto-verifies. Admin must flip
      // kycVerified true via PATCH /admin/drivers/:id (new route in admin.ts).
      const [d] = await db
        .update(drivers)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(drivers.id, sub))
        .returning();
      // v1.1.2: mirror the KYC hospital pick into the driver↔hospital join
      // table as the PRIMARY assignment, so admin's multi-assign view + the
      // hospital pages honour it. Only when a real hospital UUID was picked
      // and the driver has no assignment yet (admin reassignment wins after).
      const hid = parsed.data.hospitalId;
      if (hid && /^[0-9a-f-]{36}$/.test(hid)) {
        try {
          const existing = await db
            .select({ id: driverHospitals.id })
            .from(driverHospitals)
            .where(eq(driverHospitals.driverId, sub))
            .limit(1);
          if (existing.length === 0) {
            await db.insert(driverHospitals)
              .values({ driverId: sub, hospitalId: hid, isPrimary: true })
              .onConflictDoNothing();
          }
        } catch {
          /* best-effort — drivers.hospitalId is still set as the mirror */
        }
      }
      return reply.send({ driver: d });
    }
  );

  // v1.2.4 (helpdesk): driver app Help & Support. Tickets raised here carry
  // source='DRIVER' and are scoped to raiser_driver_id=sub. RBAC — a driver only
  // ever sees / posts on their OWN tickets (raiser_driver_id=sub); any other
  // ticket (hospital/user-raised, or another driver's) 404s, never leaking
  // another raiser's thread. RIDE tickets must reference a booking THIS driver
  // served (driver_id=sub) else 400. Raised tickets never touch portal_* columns.

  // POST /driver/tickets — raise a ticket. { category?, subjectType?('GENERAL'
  // |'RIDE'), bookingId?, message }. Defaults category=ISSUE, subjectType=GENERAL.
  // Inserts the ticket + seeds the first thread row (author_role DRIVER,
  // author_name = driver name) so the card reads as one conversation.
  app.post(
    "/api/v1/driver/tickets",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const subjectType =
        String(req.body?.subjectType ?? "GENERAL").trim().toUpperCase() === "RIDE" ? "RIDE" : "GENERAL";
      const message = String(req.body?.message ?? "").trim();
      // FEEDBACK (soft) vs ISSUE (actionable). Mirrors hospital.ts — omitted/
      // unknown lands in the actionable ISSUE bucket.
      const category =
        String(req.body?.category ?? "ISSUE").trim().toUpperCase() === "FEEDBACK" ? "FEEDBACK" : "ISSUE";
      if (message.length < 5) return reply.code(400).send({ error: "message_too_short" });

      let bookingId: string | null = null;
      if (subjectType === "RIDE") {
        bookingId = req.body?.bookingId ? String(req.body.bookingId) : null;
        if (!bookingId) return reply.code(400).send({ error: "missing_booking" });
        // RIDE tickets must be about a booking THIS driver actually served.
        const [b] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(eq(bookings.id, bookingId), eq(bookings.driverId, sub)))
          .limit(1);
        if (!b) return reply.code(400).send({ error: "invalid_booking" }); // not this driver's ride
      }

      // Driver display name for the seeded first message's author_name (the JWT
      // carries only sub; resolve the name from the row). Null-safe.
      const [{ name: driverName = null } = {}] = await pgClient<any[]>`
        SELECT name FROM drivers WHERE id = ${sub} LIMIT 1`;

      const [{ id } = {}] = await pgClient`
        INSERT INTO support_tickets (subject_type, category, source, raiser_driver_id, booking_id, message, status)
        VALUES (${subjectType}, ${category}, 'DRIVER', ${sub}, ${bookingId}, ${message}, 'OPEN')
        RETURNING id`;
      // Seed the first thread row so the card reads as one conversation.
      await pgClient`
        INSERT INTO support_ticket_messages (ticket_id, author_role, author_name, body)
        VALUES (${id}, 'DRIVER', ${driverName}, ${message})`;
      return reply.send({ ok: true, id });
    }
  );

  // GET /driver/tickets — this driver's OWN tickets, newest first. Scoped to
  // raiser_driver_id=sub — never another raiser's tickets. Includes the linked
  // ride's display_id (never the raw UUID).
  app.get(
    "/api/v1/driver/tickets",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const rows = await pgClient`
        SELECT t.id, t.subject_type, t.category, t.message, t.status, t.created_at, t.resolved_at,
               t.booking_id, b.display_id AS booking_display_id
        FROM support_tickets t
        LEFT JOIN bookings b ON b.id = t.booking_id
        WHERE t.raiser_driver_id = ${sub}
        ORDER BY t.created_at DESC`;
      return reply.send({ tickets: rows });
    }
  );

  // GET /driver/tickets/:id — this driver's OWN ticket + its full chat thread.
  // RBAC — scoped to raiser_driver_id=sub; any ticket belonging to another
  // raiser 404s, never leaking another thread. No portal_* columns exposed.
  app.get(
    "/api/v1/driver/tickets/:id",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = String(req.params.id);
      const [t] = await pgClient<any[]>`
        SELECT t.id, t.subject_type, t.category, t.message, t.status, t.created_at, t.resolved_at,
               t.booking_id, b.display_id AS booking_display_id
        FROM support_tickets t
        LEFT JOIN bookings b ON b.id = t.booking_id
        WHERE t.id = ${id} AND t.raiser_driver_id = ${sub}
        LIMIT 1`;
      if (!t) return reply.code(404).send({ error: "not_found" }); // not this driver's → 404, never leak

      const messages = await pgClient`
        SELECT id, ticket_id, author_role, author_name, body, created_at
        FROM support_ticket_messages
        WHERE ticket_id = ${id}
        ORDER BY created_at ASC`;
      return reply.send({ ticket: t, messages });
    }
  );

  // POST /driver/tickets/:id/messages — post a reply on this driver's OWN ticket
  // thread. RBAC — verifies the ticket belongs to raiser_driver_id=sub before
  // inserting (else 404, never posting into another raiser's thread).
  // author_role DRIVER, author_name = driver name (resolved from the row, not the
  // body). body ≥2 chars.
  app.post(
    "/api/v1/driver/tickets/:id/messages",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(404).send({ error: "not_found" });
      const body = String(req.body?.body ?? "").trim();
      if (body.length < 2) return reply.code(400).send({ error: "message_too_short" });

      // Ownership check — the ticket must belong to THIS driver.
      const [t] = await pgClient<any[]>`
        SELECT id FROM support_tickets WHERE id = ${id} AND raiser_driver_id = ${sub} LIMIT 1`;
      if (!t) return reply.code(404).send({ error: "not_found" }); // not owned → 404, never leak

      const [{ name: driverName = null } = {}] = await pgClient<any[]>`
        SELECT name FROM drivers WHERE id = ${sub} LIMIT 1`;

      const [message] = await pgClient`
        INSERT INTO support_ticket_messages (ticket_id, author_role, author_name, body)
        VALUES (${id}, 'DRIVER', ${driverName}, ${body})
        RETURNING id, ticket_id, author_role, author_name, body, created_at`;
      // v1.2.4 fix: a raiser reply REOPENS a resolved ticket (honours the
      // "reply to reopen the conversation" promise shown in the app).
      await pgClient`
        UPDATE support_tickets SET status = 'OPEN', resolved_at = NULL, resolved_by = NULL
        WHERE id = ${id} AND status = 'RESOLVED'`;
      return reply.send({ message });
    }
  );
}
