import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, isNull, sql as drizzleSql } from "drizzle-orm";
import { db, bookingEvents, bookings, driverLocations, drivers, users } from "@jr/db";

// Pilot cap: any single user can have at most 3 active (un-terminal) bookings
// in flight at once. Prevents misuse + keeps dispatch fan-out load bounded.
const MAX_ACTIVE_BOOKINGS_PER_USER = 3;
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
  dropAddress: z.string().max(500).optional()
});

function estimateFare(pickupLat: number, pickupLng: number, dropLat?: number, dropLng?: number) {
  if (dropLat == null || dropLng == null) return config.baseFareInr;
  const km = haversineDistanceKm(pickupLat, pickupLng, dropLat, dropLng);
  return Math.round(config.baseFareInr + km * config.perKmFareInr);
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
          message: `You already have ${activeCount} active bookings. Complete or cancel one before booking again (limit ${MAX_ACTIVE_BOOKINGS_PER_USER}).`,
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
          fareEstimateInr: fareEstimate
        })
        .returning();

      await db.insert(bookingEvents).values({
        bookingId: created.id,
        actor: `user:${sub}`,
        type: "booking.created",
        payloadJson: JSON.stringify({ fareEstimate })
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
      return reply.send({ booking: b });
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
    pickup: z.object({}),
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
      await db.update(bookings).set({ fareFinalInr: finalFare }).where(eq(bookings.id, id));
      await db
        .update(drivers)
        .set({ status: "AVAILABLE", updatedAt: new Date() })
        .where(eq(drivers.id, sub));
      await emitBookingEvent(id, "booking.completed", `driver:${sub}`, { finalFare });
      return reply.send({ booking: { ...b, fareFinalInr: finalFare } });
    }
  );

  // Rating (user)
  const rateSchema = z.object({ rating: z.number().min(1).max(5), feedback: z.string().max(500).optional() });
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
      const [b] = await db
        .update(bookings)
        .set({ rating: parsed.data.rating, feedback: parsed.data.feedback })
        .where(and(eq(bookings.id, id), eq(bookings.userId, sub)))
        .returning();
      if (!b) return reply.code(404).send({ error: "not_found_or_forbidden" });
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
