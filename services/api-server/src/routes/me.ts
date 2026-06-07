import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, bookings, drivers, driverHospitals, hospitals, users, sql as pgClient } from "@jr/db";

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
        // v1.1.2: include the driver's hospital assignments so the app can
        // show them + reflect admin reassignment on the next /me refresh.
        const assignedHospitals = await db
          .select({ id: hospitals.id, name: hospitals.name, isPrimary: driverHospitals.isPrimary })
          .from(driverHospitals)
          .innerJoin(hospitals, eq(hospitals.id, driverHospitals.hospitalId))
          .where(eq(driverHospitals.driverId, sub))
          .orderBy(desc(driverHospitals.isPrimary), hospitals.name);
        return reply.send({ role, profile: d, hospitals: assignedHospitals });
      }
      return reply.code(403).send({ error: "forbidden" });
    }
  );

  // v1.1.0 push: register/refresh the caller's FCM device token. Works for
  // both user + driver (keyed off the JWT role). Idempotent — the app POSTs
  // this after login and on token refresh.
  const pushTokenSchema = z.object({ token: z.string().min(10).max(4096) });
  app.post(
    "/api/v1/me/push-token",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      const parsed = pushTokenSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input" });
      }
      const table = role === "driver" ? drivers : role === "user" ? users : null;
      if (!table) return reply.code(403).send({ error: "forbidden" });
      await db
        .update(table as any)
        .set({ pushToken: parsed.data.token, updatedAt: new Date() })
        .where(eq((table as any).id, sub));
      return reply.send({ ok: true });
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

  // v1.2.4 (helpdesk): user app Help & Support. Tickets raised here carry
  // source='USER' and are scoped to raiser_user_id=sub. RBAC — a user only ever
  // sees / posts on their OWN tickets (raiser_user_id=sub); any other ticket
  // (hospital/driver-raised, or another user's) 404s, never leaking another
  // raiser's thread. RIDE tickets must reference a booking THIS user owns
  // (user_id=sub) else 400. Raised tickets never touch portal_* columns.

  // POST /me/tickets — raise a ticket. { category?, subjectType?('GENERAL'
  // |'RIDE'), bookingId?, message }. Defaults category=ISSUE, subjectType=GENERAL.
  // Inserts the ticket + seeds the first thread row (author_role USER,
  // author_name = user name) so the card reads as one conversation.
  app.post(
    "/api/v1/me/tickets",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user") return reply.code(403).send({ error: "user_only" });
      const subjectType =
        String(req.body?.subjectType ?? "GENERAL").trim().toUpperCase() === "RIDE" ? "RIDE" : "GENERAL";
      const message = String(req.body?.message ?? "").trim();
      // FEEDBACK (soft) vs ISSUE (actionable). Mirrors hospital.ts / drivers.ts —
      // omitted/unknown lands in the actionable ISSUE bucket.
      const category =
        String(req.body?.category ?? "ISSUE").trim().toUpperCase() === "FEEDBACK" ? "FEEDBACK" : "ISSUE";
      if (message.length < 5) return reply.code(400).send({ error: "message_too_short" });

      let bookingId: string | null = null;
      if (subjectType === "RIDE") {
        bookingId = req.body?.bookingId ? String(req.body.bookingId) : null;
        if (!bookingId) return reply.code(400).send({ error: "missing_booking" });
        // RIDE tickets must be about a booking THIS user owns.
        const [b] = await db
          .select({ id: bookings.id })
          .from(bookings)
          .where(and(eq(bookings.id, bookingId), eq(bookings.userId, sub)))
          .limit(1);
        if (!b) return reply.code(400).send({ error: "invalid_booking" }); // not this user's ride
      }

      // User display name for the seeded first message's author_name (the JWT
      // carries only sub; resolve the name from the row). Null-safe.
      const [{ name: userName = null } = {}] = await pgClient<any[]>`
        SELECT name FROM users WHERE id = ${sub} LIMIT 1`;

      const [{ id } = {}] = await pgClient`
        INSERT INTO support_tickets (subject_type, category, source, raiser_user_id, booking_id, message, status)
        VALUES (${subjectType}, ${category}, 'USER', ${sub}, ${bookingId}, ${message}, 'OPEN')
        RETURNING id`;
      // Seed the first thread row so the card reads as one conversation.
      await pgClient`
        INSERT INTO support_ticket_messages (ticket_id, author_role, author_name, body)
        VALUES (${id}, 'USER', ${userName}, ${message})`;
      return reply.send({ ok: true, id });
    }
  );

  // GET /me/tickets — this user's OWN tickets, newest first. Scoped to
  // raiser_user_id=sub — never another raiser's tickets. Includes the linked
  // ride's display_id (never the raw UUID).
  app.get(
    "/api/v1/me/tickets",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user") return reply.code(403).send({ error: "user_only" });
      const rows = await pgClient`
        SELECT t.id, t.subject_type, t.category, t.message, t.status, t.created_at, t.resolved_at,
               t.booking_id, b.display_id AS booking_display_id
        FROM support_tickets t
        LEFT JOIN bookings b ON b.id = t.booking_id
        WHERE t.raiser_user_id = ${sub}
        ORDER BY t.created_at DESC`;
      return reply.send({ tickets: rows });
    }
  );

  // GET /me/tickets/:id — this user's OWN ticket + its full chat thread.
  // RBAC — scoped to raiser_user_id=sub; any ticket belonging to another raiser
  // 404s, never leaking another thread. No portal_* columns exposed.
  app.get(
    "/api/v1/me/tickets/:id",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user") return reply.code(403).send({ error: "user_only" });
      const id = String(req.params.id);
      const [t] = await pgClient<any[]>`
        SELECT t.id, t.subject_type, t.category, t.message, t.status, t.created_at, t.resolved_at,
               t.booking_id, b.display_id AS booking_display_id
        FROM support_tickets t
        LEFT JOIN bookings b ON b.id = t.booking_id
        WHERE t.id = ${id} AND t.raiser_user_id = ${sub}
        LIMIT 1`;
      if (!t) return reply.code(404).send({ error: "not_found" }); // not this user's → 404, never leak

      const messages = await pgClient`
        SELECT id, ticket_id, author_role, author_name, body, created_at
        FROM support_ticket_messages
        WHERE ticket_id = ${id}
        ORDER BY created_at ASC`;
      return reply.send({ ticket: t, messages });
    }
  );

  // POST /me/tickets/:id/messages — post a reply on this user's OWN ticket
  // thread. RBAC — verifies the ticket belongs to raiser_user_id=sub before
  // inserting (else 404, never posting into another raiser's thread).
  // author_role USER, author_name = user name (resolved from the row, not the
  // body). body ≥2 chars.
  app.post(
    "/api/v1/me/tickets/:id/messages",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user") return reply.code(403).send({ error: "user_only" });
      const id = String(req.params.id);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return reply.code(404).send({ error: "not_found" });
      const body = String(req.body?.body ?? "").trim();
      if (body.length < 2) return reply.code(400).send({ error: "message_too_short" });

      // Ownership check — the ticket must belong to THIS user.
      const [t] = await pgClient<any[]>`
        SELECT id FROM support_tickets WHERE id = ${id} AND raiser_user_id = ${sub} LIMIT 1`;
      if (!t) return reply.code(404).send({ error: "not_found" }); // not owned → 404, never leak

      const [{ name: userName = null } = {}] = await pgClient<any[]>`
        SELECT name FROM users WHERE id = ${sub} LIMIT 1`;

      const [message] = await pgClient`
        INSERT INTO support_ticket_messages (ticket_id, author_role, author_name, body)
        VALUES (${id}, 'USER', ${userName}, ${body})
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
