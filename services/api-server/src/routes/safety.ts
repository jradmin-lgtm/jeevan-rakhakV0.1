/**
 * v1.3.0. In-Ride Safety Alert (panic) routes.
 *
 * A safety alert is a time-critical, location-bearing "all hands near here"
 * event raised by the rider OR the driver during an active ride. It is
 * deliberately distinct from the patient SOS booking (dispatch) and the
 * helpdesk (async chat):
 *   - one-shot geo fan-out to every AVAILABLE driver within a radius (no
 *     cascade waves, everyone nearby is pinged at once),
 *   - a loud, poll-based admin surface,
 *   - the co-rider on the ride is NEVER notified (the threat may be them).
 *
 * Geo/eligibility logic mirrors the SOS cascade's `getEligibleDrivers` (a local
 * copy so this stays decoupled from the cascade engine). Socket fan-out reuses
 * the SAME `/internal/emit-to-driver` HTTP bridge as sos-cascade; push reuses
 * pushToDriver / dismissPushToDriver. Additive only, no existing flow changes.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  safetyAlerts,
  safetyAlertAcks,
  bookings,
  drivers,
  driverHeartbeats,
  users,
  sql as pgClient
} from "@jr/db";
import { config } from "@jr/config";
import { haversineDistanceKm } from "@jr/utils";
import { dismissPushToDriver, pushToDriver } from "../push";

// New env vars (read with the `?? default` idiom, mirroring sos-cascade).
// SAFETY_NEARBY_RADIUS_KM bounds the one-shot fan-out; SAFETY_MAX_RESPONDERS
// caps how many drivers get pinged (and is also the fail-open widen count).
const NEARBY_RADIUS_KM = Number(process.env.SAFETY_NEARBY_RADIUS_KM ?? 5);
const MAX_RESPONDERS = Number(process.env.SAFETY_MAX_RESPONDERS ?? 10);
// Reuse the SOS staleness window for the heartbeat-vs-lastLat freshness gate so
// both engines agree on "where is this driver right now".
const STALENESS_MIN = Number(process.env.SOS_CASCADE_STALENESS_MIN ?? 5);

// A ride is "active" (and so eligible for a safety alert) only in these states.
const ACTIVE_RIDE_STATUSES = new Set(["ACCEPTED", "ARRIVED", "PICKED_UP"]);

type SafetyResponder = { driverId: string; distanceKm: number };

/**
 * Mirrors sos-cascade `getEligibleDrivers`, with two differences purpose-built
 * for the safety fan-out:
 *   - it excludes a caller-supplied id list (the ride's own driver + the raiser
 *     if a driver), and
 *   - it FAILS OPEN: if zero drivers sit inside SAFETY_NEARBY_RADIUS_KM, it
 *     widens to the nearest SAFETY_MAX_RESPONDERS regardless of radius so help
 *     is never withheld.
 *
 * Candidate set: AVAILABLE + not disabled + kyc_verified, LEFT JOIN heartbeats.
 * Position: recent heartbeat (within STALENESS_MIN) else recent lastLat/lastLng,
 * else the driver is skipped (no usable recent position). Result is capped at
 * SAFETY_MAX_RESPONDERS.
 */
async function getSafetyResponders(
  lat: number,
  lng: number,
  excludeDriverIds: string[]
): Promise<SafetyResponder[]> {
  const staleness = new Date(Date.now() - STALENESS_MIN * 60 * 1000);
  const exclude = new Set(excludeDriverIds.filter(Boolean));
  const candidates = await db
    .select({
      driverId: drivers.id,
      hbLat: driverHeartbeats.lat,
      hbLng: driverHeartbeats.lng,
      hbAt: driverHeartbeats.updatedAt,
      lastLat: drivers.lastLat,
      lastLng: drivers.lastLng,
      lastSeenAt: drivers.lastSeenAt
    })
    .from(drivers)
    .leftJoin(driverHeartbeats, eq(driverHeartbeats.driverId, drivers.id))
    .where(
      and(
        eq(drivers.status, "AVAILABLE"),
        eq(drivers.disabled, false),
        eq(drivers.kycVerified, true)
      )
    );
  const withDistance = candidates
    .map((c) => {
      if (exclude.has(c.driverId)) return null;
      const hbFresh = c.hbAt != null && c.hbAt >= staleness;
      const seenFresh = c.lastSeenAt != null && c.lastSeenAt >= staleness;
      // Prefer the heartbeat position; fall back to last-known GPS. Skip a
      // driver only when we have NO usable recent position at all.
      const dLat = hbFresh ? c.hbLat : seenFresh ? c.lastLat : null;
      const dLng = hbFresh ? c.hbLng : seenFresh ? c.lastLng : null;
      if (dLat == null || dLng == null) return null;
      return {
        driverId: c.driverId,
        distanceKm: haversineDistanceKm(dLat, dLng, lat, lng)
      } as SafetyResponder;
    })
    .filter((d): d is SafetyResponder => d !== null);
  withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  const inRadius = withDistance.filter((d) => d.distanceKm <= NEARBY_RADIUS_KM);
  // Fail-open: if nobody is inside the radius, widen to the nearest few so help
  // is never withheld. Always cap at SAFETY_MAX_RESPONDERS.
  const chosen = inRadius.length > 0 ? inRadius : withDistance;
  return chosen.slice(0, MAX_RESPONDERS);
}

/**
 * Socket fan-out via the SAME HTTP bridge as sos-cascade `emitToDriver`.
 * Best-effort. A cold socket-server must never break the raise/cancel/resolve
 * request; the DB row + the /driver/safety-active poll fallback are the source
 * of truth.
 */
async function emitToDriver(driverId: string, event: string, payload: unknown) {
  try {
    await fetch(`${config.socketBaseUrl}/internal/emit-to-driver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
      body: JSON.stringify({ driverId, event, payload })
    });
  } catch (err) {
    console.warn("[safety] emit-to-driver failed", err);
  }
}

/**
 * Socket fan-out to a USER, via the SAME HTTP bridge as `emitToDriver` but
 * POSTing to /internal/emit-to-user (socket-server exposes both). Best-effort:
 * a cold socket-server must never break the cancel/resolve request. Used to
 * reach the RAISER on clear so their Emergency bar leaves the ACTIVE state when
 * an admin resolves (or a cross-party cancels) the alert — the raiser is never
 * in notifiedDriverIds, so the responder-card clear alone never reaches them.
 */
async function emitToUser(userId: string, event: string, payload: unknown) {
  try {
    await fetch(`${config.socketBaseUrl}/internal/emit-to-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
      body: JSON.stringify({ userId, event, payload })
    });
  } catch (err) {
    console.warn("[safety] emit-to-user failed", err);
  }
}

/**
 * Clear an alert that is no longer ACTIVE (cancelled by the raiser, resolved by
 * admin, or auto-resolved on ride end). Two audiences:
 *   - every responder: emit `safety:cleared` over the bridge (dismisses a
 *     foregrounded card) AND a silent push dismiss (clears a backgrounded/killed
 *     tray entry; the push tray entry was tagged by alertId), and
 *   - the RAISER: emit `safety:cleared` to their own room so their Emergency bar
 *     drops out of ACTIVE. The raiser is never in notifiedDriverIds, so without
 *     this an admin-resolve / cross-party cancel left the raiser bar stuck.
 * `raiser` carries whichever raiser id is set (exactly one); both null is fine
 * (the responder clear still runs).
 */
async function clearResponderCards(
  alertId: string,
  notifiedDriverIds: string[],
  raiser?: { raiserUserId: string | null; raiserDriverId: string | null }
) {
  for (const driverId of notifiedDriverIds) {
    if (!driverId) continue;
    await emitToDriver(driverId, "safety:cleared", { alertId });
    void dismissPushToDriver(driverId, alertId);
  }
  // Also stand the raiser's own Emergency bar down.
  if (raiser?.raiserUserId) {
    await emitToUser(raiser.raiserUserId, "safety:cleared", { alertId });
  }
  if (raiser?.raiserDriverId) {
    await emitToDriver(raiser.raiserDriverId, "safety:cleared", { alertId });
  }
}

const raiseSchema = z.object({
  bookingId: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  note: z.string().max(500).optional()
});

const ackSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional()
});

const resolveSchema = z.object({
  resolvedBy: z.string()
});

export async function registerSafetyRoutes(app: FastifyInstance) {
  // POST /safety/raise: rider OR driver raises a panic alert on an active ride.
  app.post(
    "/api/v1/safety/raise",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user" && role !== "driver") {
        return reply.code(403).send({ error: "user_or_driver_only" });
      }
      const parsed = raiseSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const { bookingId, lat, lng, note } = parsed.data;

      const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
      if (!b) return reply.code(404).send({ error: "booking_not_found" });
      if (!ACTIVE_RIDE_STATUSES.has(b.status)) {
        return reply.code(409).send({ error: "ride_not_active" });
      }
      // Ownership: the raiser must be a party to THIS ride.
      const isRaiserUser = role === "user" && b.userId === sub;
      const isRaiserDriver = role === "driver" && b.driverId === sub;
      if (!isRaiserUser && !isRaiserDriver) {
        return reply.code(403).send({ error: "not_your_ride" });
      }

      // Idempotency (race-safe): a double-tap must NOT create two ACTIVE alerts
      // (and so must NOT double fan-out). Instead of SELECT-then-INSERT (a
      // check-then-act gap two concurrent raises can both pass), do an ATOMIC
      // conflict-aware INSERT against the partial-unique index
      // `safety_alerts_one_active_per_raiser` ON (booking_id,
      // COALESCE(raiser_user_id, raiser_driver_id)) WHERE status = 'ACTIVE'.
      // Raw pgClient is used here because the conflict target is a COALESCE
      // expression + a partial WHERE, which drizzle's typed onConflict can't
      // express. A returned row means this raise WON the insert (genuinely new →
      // fan out below). No returned row means a concurrent/earlier ACTIVE alert
      // already exists → re-SELECT and return it WITHOUT any fan-out.
      const raiserRole = role === "user" ? "USER" : "DRIVER";
      const raiserUserId = role === "user" ? sub : null;
      const raiserDriverId = role === "driver" ? sub : null;
      const displayId = b.displayId ?? null;
      const noteValue = note ?? null;
      // notified_driver_ids is omitted so the column's DDL default ('[]'::jsonb)
      // fills it; the responder ids are persisted by the UPDATE after fan-out.
      const inserted = await pgClient`
        INSERT INTO safety_alerts
          (booking_id, display_id, raiser_role, raiser_user_id, raiser_driver_id,
           lat, lng, note, status)
        VALUES
          (${bookingId}, ${displayId}, ${raiserRole}, ${raiserUserId}, ${raiserDriverId},
           ${lat}, ${lng}, ${noteValue}, 'ACTIVE')
        ON CONFLICT (booking_id, COALESCE(raiser_user_id, raiser_driver_id))
          WHERE status = 'ACTIVE'
          DO NOTHING
        RETURNING id
      `;

      if (inserted.length === 0) {
        // Conflict: an ACTIVE alert for this booking + raiser already exists.
        // Idempotent reuse — return it, NO fan-out (the original raise already
        // pinged the responders; re-firing would double-notify).
        const existing = await db
          .select()
          .from(safetyAlerts)
          .where(
            and(
              eq(safetyAlerts.bookingId, bookingId),
              eq(safetyAlerts.status, "ACTIVE"),
              role === "user"
                ? eq(safetyAlerts.raiserUserId, sub)
                : eq(safetyAlerts.raiserDriverId, sub)
            )
          )
          .limit(1);
        if (existing[0]) {
          const ids = Array.isArray(existing[0].notifiedDriverIds)
            ? (existing[0].notifiedDriverIds as string[])
            : [];
          return reply.send({ alert: existing[0], notified: ids.length });
        }
        // Defensive: conflict fired but the row isn't visible (should not
        // happen). Treat as a no-op reuse rather than risk a second fan-out.
        return reply.send({ alert: null, notified: 0 });
      }

      // We won the insert — this is a genuinely NEW alert. Re-read via drizzle so
      // the row shape (camelCase + parsed jsonb) matches the rest of the handler.
      const newId = (inserted[0] as any).id as string;
      const [alert] = await db
        .select()
        .from(safetyAlerts)
        .where(eq(safetyAlerts.id, newId))
        .limit(1);

      // One-shot fan-out. Never ping the co-rider's driver or the raising
      // driver; everyone else nearby gets the ping at once.
      const excludeDriverIds = [b.driverId ?? "", role === "driver" ? sub : ""];
      const responders = await getSafetyResponders(lat, lng, excludeDriverIds);
      const notifiedDriverIds = responders.map((r) => r.driverId);

      // Persist the responder id list so their cards can be cleared on
      // cancel/resolve.
      await db
        .update(safetyAlerts)
        .set({ notifiedDriverIds, updatedAt: new Date() })
        .where(eq(safetyAlerts.id, alert.id));

      const createdAtIso = alert.createdAt
        ? new Date(alert.createdAt).toISOString()
        : new Date().toISOString();
      for (const r of responders) {
        // High-priority push so a backgrounded/killed responder still wakes.
        // sendPush auto-promotes data.bookingId to the Android tag/collapseKey,
        // so we set data.bookingId = alertId here (NOT the ride booking id) so
        // the tray entry is tagged by alertId — then dismissPushToDriver(driver,
        // alertId) in clearResponderCards matches and clears it. The real ride
        // booking id rides under a separate key (rideBookingId) for context.
        void pushToDriver(
          r.driverId,
          "🆘 Safety alert nearby",
          `Ride #${b.displayId ?? ""} needs help nearby. Tap to assist.`,
          {
            type: "safety",
            alertId: alert.id,
            bookingId: alert.id,
            rideBookingId: bookingId,
            lat: String(lat),
            lng: String(lng)
          }
        );
        // Foregrounded card via the socket bridge. UNCHANGED: this carries the
        // REAL ride bookingId + displayId so the responder card renders right.
        await emitToDriver(r.driverId, "safety:alert", {
          alertId: alert.id,
          bookingId,
          displayId: b.displayId ?? null,
          lat,
          lng,
          distanceKm: r.distanceKm,
          createdAt: createdAtIso
        });
      }

      return reply.send({
        alert: { ...alert, notifiedDriverIds },
        notified: responders.length
      });
    }
  );

  // POST /safety/:id/ack: a responding driver taps "I am responding".
  app.post(
    "/api/v1/safety/:id/ack",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const id = String(req.params.id);
      const parsed = ackSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }

      const [alert] = await db.select().from(safetyAlerts).where(eq(safetyAlerts.id, id)).limit(1);
      if (!alert) return reply.code(404).send({ error: "not_found" });
      if (alert.status !== "ACTIVE") return reply.code(409).send({ error: "alert_not_active" });
      // Authorization: only a driver who was actually PINGED for this alert may
      // ack it. Without this, any authenticated driver could POST an ack on an
      // alert they were never notified about and appear as a responder.
      const notifiedForAck = Array.isArray(alert.notifiedDriverIds)
        ? (alert.notifiedDriverIds as string[])
        : [];
      if (!notifiedForAck.includes(sub)) {
        return reply.code(403).send({ error: "not_notified" });
      }

      // Idempotent upsert via the UNIQUE(alert_id, driver_id) index. A repeat
      // tap just refreshes the position + respondedAt.
      await db
        .insert(safetyAlertAcks)
        .values({
          alertId: id,
          driverId: sub,
          lat: parsed.data.lat ?? null,
          lng: parsed.data.lng ?? null,
          respondedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [safetyAlertAcks.alertId, safetyAlertAcks.driverId],
          set: {
            lat: parsed.data.lat ?? null,
            lng: parsed.data.lng ?? null,
            respondedAt: new Date()
          }
        });
      return reply.send({ ok: true });
    }
  );

  // POST /safety/:id/cancel: the raiser stands down ("I am safe").
  app.post(
    "/api/v1/safety/:id/cancel",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "user" && role !== "driver") {
        return reply.code(403).send({ error: "user_or_driver_only" });
      }
      const id = String(req.params.id);

      const [alert] = await db.select().from(safetyAlerts).where(eq(safetyAlerts.id, id)).limit(1);
      if (!alert) return reply.code(404).send({ error: "not_found" });
      // Only the raiser may stand the alert down.
      const isRaiser =
        (role === "user" && alert.raiserUserId === sub) ||
        (role === "driver" && alert.raiserDriverId === sub);
      if (!isRaiser) return reply.code(403).send({ error: "not_your_alert" });
      if (alert.status !== "ACTIVE") return reply.code(409).send({ error: "alert_not_active" });

      await db
        .update(safetyAlerts)
        .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(safetyAlerts.id, id));

      // Clear every responder's card (foreground socket + background push) AND
      // stand the raiser's own Emergency bar down. A cross-party cancel (the
      // co-party standing the alert down) must reach the raiser too, so the
      // raiser ids are passed through to clearResponderCards.
      const notifiedDriverIds = Array.isArray(alert.notifiedDriverIds)
        ? (alert.notifiedDriverIds as string[])
        : [];
      await clearResponderCards(id, notifiedDriverIds, {
        raiserUserId: alert.raiserUserId,
        raiserDriverId: alert.raiserDriverId
      });

      return reply.send({ ok: true });
    }
  );

  // GET /driver/safety-active: poll fallback for responders (socket can miss,
  // the SOS poll-fallback lesson). Returns ACTIVE alerts this driver was pinged
  // for, each with an `acked` flag.
  app.get(
    "/api/v1/driver/safety-active",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });

      const activeAlerts = await db
        .select()
        .from(safetyAlerts)
        .where(eq(safetyAlerts.status, "ACTIVE"))
        .orderBy(desc(safetyAlerts.createdAt));

      // This driver's acks, so we can flag the cards already responded to.
      const myAcks = await db
        .select({ alertId: safetyAlertAcks.alertId })
        .from(safetyAlertAcks)
        .where(eq(safetyAlertAcks.driverId, sub));
      const ackedIds = new Set(myAcks.map((a) => a.alertId));

      const alerts = activeAlerts
        .filter((a) => {
          const ids = Array.isArray(a.notifiedDriverIds)
            ? (a.notifiedDriverIds as string[])
            : [];
          return ids.includes(sub);
        })
        .map((a) => ({
          id: a.id,
          bookingId: a.bookingId,
          displayId: a.displayId,
          lat: a.lat,
          lng: a.lng,
          createdAt: a.createdAt,
          acked: ackedIds.has(a.id)
        }));

      return reply.send({ alerts });
    }
  );

  // GET /admin/safety?status=active|all: admin list, newest first, joined with
  // the raiser name + the responder list.
  app.get(
    "/api/v1/admin/safety",
    { preHandler: [(app as any).requireAdminKey] },
    async (req: any, reply) => {
      const status = String(req?.query?.status ?? "active").toLowerCase();

      const rows =
        status === "all"
          ? await db.select().from(safetyAlerts).orderBy(desc(safetyAlerts.createdAt)).limit(500)
          : await db
              .select()
              .from(safetyAlerts)
              .where(eq(safetyAlerts.status, "ACTIVE"))
              .orderBy(desc(safetyAlerts.createdAt))
              .limit(500);

      const alerts = [];
      for (const a of rows) {
        // Raiser display name (user or driver).
        let raiserName: string | null = null;
        if (a.raiserUserId) {
          const [u] = await db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, a.raiserUserId))
            .limit(1);
          raiserName = u?.name ?? null;
        } else if (a.raiserDriverId) {
          const [d] = await db
            .select({ name: drivers.name })
            .from(drivers)
            .where(eq(drivers.id, a.raiserDriverId))
            .limit(1);
          raiserName = d?.name ?? null;
        }
        // Responder list (driver name + respondedAt) from the acks table.
        const ackRows = await db
          .select({
            driverId: safetyAlertAcks.driverId,
            driverName: drivers.name,
            respondedAt: safetyAlertAcks.respondedAt
          })
          .from(safetyAlertAcks)
          .leftJoin(drivers, eq(drivers.id, safetyAlertAcks.driverId))
          .where(eq(safetyAlertAcks.alertId, a.id))
          .orderBy(desc(safetyAlertAcks.respondedAt));
        // SNAKE_CASE response — the two admin client components
        // (SafetyAlertsClient + SafetyAlertDetailLive) read these exact keys.
        // The single raiserName lookup above is split into the two
        // role-specific fields the client expects (raiser_user_name when the
        // raiser is a USER, raiser_driver_name when a DRIVER), so the surface
        // renders the raiser instead of "User"/"Driver" placeholders.
        const isUserRaiser = (a.raiserRole ?? "").toUpperCase() === "USER";
        alerts.push({
          id: a.id,
          booking_id: a.bookingId,
          display_id: a.displayId,
          raiser_role: a.raiserRole,
          raiser_user_id: a.raiserUserId,
          raiser_user_name: isUserRaiser ? raiserName : null,
          raiser_driver_id: a.raiserDriverId,
          raiser_driver_name: isUserRaiser ? null : raiserName,
          lat: a.lat,
          lng: a.lng,
          status: a.status,
          resolved_by: a.resolvedBy,
          resolved_at: a.resolvedAt,
          cancelled_at: a.cancelledAt,
          created_at: a.createdAt,
          updated_at: a.updatedAt,
          responders: ackRows.map((r) => ({
            driver_id: r.driverId,
            driver_name: r.driverName ?? null,
            responded_at: r.respondedAt
          }))
        });
      }

      return reply.send({ alerts });
    }
  );

  // GET /admin/safety/count: lightweight count for the badge + banner.
  app.get(
    "/api/v1/admin/safety/count",
    { preHandler: [(app as any).requireAdminKey] },
    async (_req: any, reply) => {
      const rows = await db
        .select({ id: safetyAlerts.id })
        .from(safetyAlerts)
        .where(eq(safetyAlerts.status, "ACTIVE"));
      return reply.send({ active: rows.length });
    }
  );

  // POST /admin/safety/:id/resolve: ops closes an alert. Captures the resolver
  // name; clears every responder card (same as cancel).
  app.post(
    "/api/v1/admin/safety/:id/resolve",
    { preHandler: [(app as any).requireAdminKey] },
    async (req: any, reply) => {
      const id = String(req.params.id);
      const parsed = resolveSchema.safeParse(req.body ?? {});
      const resolvedBy = parsed.success ? parsed.data.resolvedBy : "";
      if (resolvedBy.trim().length < 2) {
        return reply.code(400).send({ error: "resolver_name_required" });
      }

      const [alert] = await db.select().from(safetyAlerts).where(eq(safetyAlerts.id, id)).limit(1);
      if (!alert) return reply.code(404).send({ error: "not_found" });
      // Status guard: resolve only an ACTIVE alert. If it is already RESOLVED /
      // CANCELLED (or was auto-resolved on ride end), this is a no-op — return
      // 409 so the close can't re-fire its clear/notify side effects.
      if (alert.status !== "ACTIVE") {
        return reply.code(409).send({ error: "alert_not_active" });
      }

      await db
        .update(safetyAlerts)
        .set({
          status: "RESOLVED",
          resolvedBy: resolvedBy.trim(),
          resolvedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(safetyAlerts.id, id));

      // Clear responder cards AND stand the raiser's Emergency bar down. The
      // raiser is never a responder, so without the raiser ids the admin resolve
      // would leave the raiser bar stuck ACTIVE.
      const notifiedDriverIds = Array.isArray(alert.notifiedDriverIds)
        ? (alert.notifiedDriverIds as string[])
        : [];
      await clearResponderCards(id, notifiedDriverIds, {
        raiserUserId: alert.raiserUserId,
        raiserDriverId: alert.raiserDriverId
      });

      return reply.send({ ok: true });
    }
  );
}

/**
 * v1.3.1: auto-resolve any ACTIVE safety alert(s) for a booking when the ride
 * itself reaches a terminal state (COMPLETED / CANCELLED). Once the ride is over
 * the panic context is gone, so a still-ACTIVE alert is stale: it would keep the
 * raiser's Emergency bar lit and responder cards on driver apps forever. This
 * marks each ACTIVE alert RESOLVED (resolved_by = 'system:ride_ended') and then
 * runs the SAME clear+notify path as the admin resolve / raiser cancel: clears
 * every responder card AND stands the raiser's own bar down.
 *
 * Fire-and-forget from the booking lifecycle handlers (void it) so it never
 * blocks or fails the COMPLETE / CANCEL response — matching the existing
 * best-effort push/socket idioms. Errors are swallowed (logged) here.
 */
export async function autoResolveSafetyForBooking(bookingId: string): Promise<void> {
  if (!bookingId) return;
  try {
    const active = await db
      .select()
      .from(safetyAlerts)
      .where(and(eq(safetyAlerts.bookingId, bookingId), eq(safetyAlerts.status, "ACTIVE")));
    if (active.length === 0) return;
    const now = new Date();
    for (const alert of active) {
      await db
        .update(safetyAlerts)
        .set({
          status: "RESOLVED",
          resolvedBy: "system:ride_ended",
          resolvedAt: now,
          updatedAt: now
        })
        .where(eq(safetyAlerts.id, alert.id));
      const notifiedDriverIds = Array.isArray(alert.notifiedDriverIds)
        ? (alert.notifiedDriverIds as string[])
        : [];
      await clearResponderCards(alert.id, notifiedDriverIds, {
        raiserUserId: alert.raiserUserId,
        raiserDriverId: alert.raiserDriverId
      });
    }
  } catch (err) {
    console.warn("[safety] autoResolveSafetyForBooking failed", err);
  }
}
