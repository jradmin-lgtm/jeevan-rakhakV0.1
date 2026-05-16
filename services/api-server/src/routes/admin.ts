import type { FastifyInstance } from "fastify";
import { and, count, desc, eq, gte, sql as drizzleSql } from "drizzle-orm";
import { bookingEvents, bookings, drivers, db, users, systemEvents } from "@jr/db";

type Source = "all" | "real" | "demo";

function sourceClause(source: Source, col: any) {
  if (source === "real") return eq(col, false);
  if (source === "demo") return eq(col, true);
  return undefined;
}

function pickSource(req: any): Source {
  const s = String(req?.query?.source ?? "all").toLowerCase();
  if (s === "real" || s === "demo") return s;
  return "all";
}

export async function registerAdminRoutes(app: FastifyInstance) {
  // Every admin route requires the x-admin-key header. The decorator is
  // registered on the app instance in main.ts. Anything without the key gets
  // 401 before touching the DB.
  const adminGuard = { preHandler: [(app as any).requireAdminKey] };

  app.get("/api/v1/admin/dashboard", adminGuard, async (req, reply) => {
    const source = pickSource(req);
    const bookingFilter = sourceClause(source, bookings.isDemo);
    const driverFilter = sourceClause(source, drivers.isDemo);

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const [activeRow] = await db
      .select({ c: count() })
      .from(bookings)
      .where(
        and(
          drizzleSql`${bookings.status} IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')`,
          bookingFilter
        )
      );

    const [onlineRow] = await db
      .select({ c: count() })
      .from(drivers)
      .where(
        and(drizzleSql`${drivers.status} IN ('AVAILABLE','ON_TRIP')`, driverFilter)
      );

    const [todayRow] = await db
      .select({ c: count() })
      .from(bookings)
      .where(and(gte(bookings.createdAt, startToday), bookingFilter));

    const [completedRow] = await db
      .select({ c: count() })
      .from(bookings)
      .where(and(eq(bookings.status, "COMPLETED"), bookingFilter));

    // Average response time = avg(acceptedAt - createdAt) for completed bookings, in minutes.
    const avgRows = await db
      .select({
        seconds: drizzleSql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${bookings.acceptedAt} - ${bookings.createdAt}))), 0)`
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.status, "COMPLETED"),
          drizzleSql`${bookings.acceptedAt} IS NOT NULL`,
          bookingFilter
        )
      );
    const avgSec = Number(avgRows[0]?.seconds ?? 0);

    return reply.send({
      source,
      activeTrips: activeRow?.c ?? 0,
      onlineDrivers: onlineRow?.c ?? 0,
      bookingsToday: todayRow?.c ?? 0,
      completedTotal: completedRow?.c ?? 0,
      avgResponseTimeMinutes: Number((avgSec / 60).toFixed(1))
    });
  });

  app.get("/api/v1/admin/bookings", adminGuard, async (req, reply) => {
    const source = pickSource(req);
    const status = String((req as any)?.query?.status ?? "all").toUpperCase();
    const filter = and(
      sourceClause(source, bookings.isDemo),
      status !== "ALL"
        ? drizzleSql`${bookings.status}::text = ${status}`
        : undefined
    );

    const rows = await db
      .select()
      .from(bookings)
      .where(filter)
      .orderBy(desc(bookings.createdAt))
      .limit(200);
    return reply.send({ source, status, bookings: rows });
  });

  app.get("/api/v1/admin/bookings/:id", adminGuard, async (req, reply) => {
    const id = (req.params as any).id as string;
    const [b] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    if (!b) return reply.code(404).send({ error: "not_found" });

    const events = await db
      .select()
      .from(bookingEvents)
      .where(eq(bookingEvents.bookingId, id))
      .orderBy(bookingEvents.createdAt);

    const [u] = b.userId
      ? await db.select().from(users).where(eq(users.id, b.userId)).limit(1)
      : [null];
    const [d] = b.driverId
      ? await db.select().from(drivers).where(eq(drivers.id, b.driverId)).limit(1)
      : [null];

    return reply.send({ booking: b, events, user: u, driver: d });
  });

  app.get("/api/v1/admin/drivers", adminGuard, async (req, reply) => {
    const source = pickSource(req);
    const filter = sourceClause(source, drivers.isDemo);

    const rows = await db
      .select()
      .from(drivers)
      .where(filter)
      .orderBy(desc(drivers.lastSeenAt))
      .limit(200);
    return reply.send({ source, drivers: rows });
  });

  app.get("/api/v1/admin/users", adminGuard, async (req, reply) => {
    const source = pickSource(req);
    const filter = sourceClause(source, users.isDemo);

    const rows = await db
      .select()
      .from(users)
      .where(filter)
      .orderBy(desc(users.createdAt))
      .limit(200);
    return reply.send({ source, users: rows });
  });

  // ─── Observability ─────────────────────────────────────────────────────────

  app.get("/api/v1/admin/health", adminGuard, async (_req, reply) => {
    const start = Date.now();
    const result: {
      api: { status: "up" | "down"; uptimeSec: number };
      db: { status: "up" | "down"; latencyMs: number | null; error?: string };
      events: { critical24h: number; error24h: number; warn24h: number };
      checkedAt: string;
    } = {
      api: { status: "up", uptimeSec: Math.floor(process.uptime()) },
      db: { status: "down", latencyMs: null },
      events: { critical24h: 0, error24h: 0, warn24h: 0 },
      checkedAt: new Date().toISOString()
    };
    try {
      const t0 = Date.now();
      await db.execute(drizzleSql`SELECT 1`);
      result.db = { status: "up", latencyMs: Date.now() - t0 };
    } catch (e: any) {
      result.db = { status: "down", latencyMs: null, error: String(e?.message ?? e).slice(0, 200) };
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const rows = await db
        .select({ level: systemEvents.level, c: count() })
        .from(systemEvents)
        .where(gte(systemEvents.ts, since))
        .groupBy(systemEvents.level);
      for (const r of rows) {
        const c = Number(r.c);
        if (r.level === "critical") result.events.critical24h = c;
        if (r.level === "error") result.events.error24h = c;
        if (r.level === "warn") result.events.warn24h = c;
      }
    } catch {
      /* leave zeros */
    }

    reply.header("x-server-time-ms", String(Date.now() - start));
    return reply.send(result);
  });

  app.get("/api/v1/admin/events", adminGuard, async (req, reply) => {
    const q = (req as any).query ?? {};
    const level = String(q.level ?? "all").toLowerCase();
    const sinceParam = q.since ? new Date(String(q.since)) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since = isNaN(sinceParam.getTime()) ? new Date(Date.now() - 24 * 60 * 60 * 1000) : sinceParam;
    const limit = Math.min(parseInt(String(q.limit ?? "100"), 10) || 100, 500);

    const filters = [gte(systemEvents.ts, since)];
    if (["info", "warn", "error", "critical"].includes(level)) {
      filters.push(eq(systemEvents.level, level));
    }

    const rows = await db
      .select()
      .from(systemEvents)
      .where(and(...filters))
      .orderBy(desc(systemEvents.ts))
      .limit(limit);
    return reply.send({ events: rows, since: since.toISOString(), limit });
  });

  app.post("/api/v1/admin/events/cleanup", adminGuard, async (_req, reply) => {
    const cutoffIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const result = await (db as any).execute(
      drizzleSql`DELETE FROM system_events WHERE ts < ${cutoffIso}::timestamptz`
    );
    return reply.send({ deletedBefore: cutoffIso, result: (result as any).rowCount ?? null });
  });

  // Mobile clients post their own anomalies here so we have a single timeline.
  app.post("/api/v1/admin/events/report", async (req, reply) => {
    const body = (req as any).body ?? {};
    const level = ["info", "warn", "error", "critical"].includes(String(body.level))
      ? (body.level as "info" | "warn" | "error" | "critical")
      : "info";
    const source = String(body.source ?? "client").slice(0, 50);
    const message = String(body.message ?? "(no message)").slice(0, 500);
    const context = typeof body.context === "object" && body.context !== null ? body.context : undefined;
    // Best-effort; never reject the client.
    try {
      const { emitEvent } = await import("../events.js");
      await emitEvent({ level, source, message, context });
    } catch {
      /* swallow */
    }
    return reply.send({ ok: true });
  });
}
