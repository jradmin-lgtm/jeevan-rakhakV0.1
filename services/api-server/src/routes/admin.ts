import type { FastifyInstance } from "fastify";
import { and, count, desc, eq, gte, sql as drizzleSql } from "drizzle-orm";
import { bookingEvents, bookings, drivers, db, users } from "@jr/db";

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
}
