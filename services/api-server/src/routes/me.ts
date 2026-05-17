import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, bookings, drivers, users } from "@jr/db";

const profileUpdate = z.object({
  name: z.string().min(1).max(120).optional(),
  bloodGroup: z.string().max(8).optional(),
  allergies: z.string().max(2000).optional(),
  emergencyContact: z.string().max(40).optional()
});

export async function registerMeRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/me",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role === "user") {
        const [u] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
        if (!u) return reply.code(404).send({ error: "not_found" });
        return reply.send({ role, profile: u });
      }
      if (role === "driver") {
        const [d] = await db.select().from(drivers).where(eq(drivers.id, sub)).limit(1);
        if (!d) return reply.code(404).send({ error: "not_found" });
        return reply.send({ role, profile: d });
      }
      return reply.code(403).send({ error: "forbidden" });
    }
  );

  app.patch(
    "/api/v1/me",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      const parsed = profileUpdate.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      if (role === "user") {
        const [u] = await db
          .update(users)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(users.id, sub))
          .returning();
        return reply.send({ role, profile: u });
      }
      if (role === "driver") {
        const [d] = await db
          .update(drivers)
          .set({ name: data.name, updatedAt: new Date() })
          .where(eq(drivers.id, sub))
          .returning();
        return reply.send({ role, profile: d });
      }
      return reply.code(403).send({ error: "forbidden" });
    }
  );

  /**
   * Account deletion — Google Play Console requires every app that lets a
   * user sign in to also let that user delete their account from within the
   * app (effective May 2023, "Account deletion" policy). This endpoint:
   *
   *  1. Marks the row disabled=true so subsequent sign-ins are rejected with
   *     account_disabled (cleaner than a 404 — the user could otherwise
   *     re-create accidentally with the same Google account).
   *  2. Anonymises PII fields so a future leak doesn't expose them:
   *     email/name/picture/auth_subject/auth_provider/bloodGroup/allergies/
   *     emergencyContact all → NULL. Phone is RETAINED (we need it to honour
   *     ride-history retention for completed trips that affect drivers'
   *     earnings + tax records).
   *  3. Cancels any in-flight bookings for this user/driver. Completed trips
   *     stay in the bookings table so the driver's payout records are
   *     intact, but they're disconnected from any PII.
   *
   * A driver who deletes mid-trip is a corner case — we reject the request
   * with 409 and tell them to complete the trip first. Otherwise an
   * in-progress booking would lose its driver pointer.
   */
  app.post(
    "/api/v1/me/delete",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      const now = new Date();

      if (role === "driver") {
        // Refuse if the driver has an ACTIVE trip — losing the driver
        // reference mid-pickup would strand the patient.
        const inFlight = await db
          .select({ id: bookings.id, status: bookings.status })
          .from(bookings)
          .where(
            and(
              eq(bookings.driverId, sub),
              inArray(bookings.status, ["ACCEPTED", "ARRIVED", "PICKED_UP"])
            )
          )
          .limit(1);
        if (inFlight.length > 0) {
          return reply.code(409).send({
            error: "active_trip_exists",
            message: "Please complete or cancel your current trip before deleting your account."
          });
        }
        await db
          .update(drivers)
          .set({
            disabled: true,
            name: null,
            email: null,
            pictureUrl: null,
            authSubject: null,
            // authProvider deliberately left as-is so admin can still see how
            // the row was originally created in the audit trail.
            // phone retained for trip-history continuity.
            updatedAt: now
          })
          .where(eq(drivers.id, sub));
        return reply.send({ deleted: true });
      }

      if (role === "user") {
        // Cancel any in-flight bookings owned by this user. A REQUESTED ride
        // that's still searching for a driver just becomes CANCELLED.
        // ACCEPTED/ARRIVED rides also get cancelled — the assigned driver
        // will see the status flip and stand down. We DON'T allow deletion
        // while PICKED_UP because the patient is currently in an ambulance.
        const inAmbulance = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(eq(bookings.userId, sub), eq(bookings.status, "PICKED_UP")))
          .limit(1);
        if (inAmbulance.length > 0) {
          return reply.code(409).send({
            error: "ride_in_progress",
            message: "You're currently in an ambulance. Please wait until the trip is completed before deleting your account."
          });
        }
        await db
          .update(bookings)
          .set({ status: "CANCELLED", cancelledAt: now })
          .where(
            and(
              eq(bookings.userId, sub),
              inArray(bookings.status, ["REQUESTED", "ACCEPTED", "ARRIVED"])
            )
          );
        await db
          .update(users)
          .set({
            disabled: true,
            name: null,
            email: null,
            pictureUrl: null,
            authSubject: null,
            bloodGroup: null,
            allergies: null,
            emergencyContact: null,
            updatedAt: now
          })
          .where(eq(users.id, sub));
        return reply.send({ deleted: true });
      }

      return reply.code(403).send({ error: "forbidden" });
    }
  );
}
