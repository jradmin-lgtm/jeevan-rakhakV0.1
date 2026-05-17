import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, gte, lte, sql as drizzleSql } from "drizzle-orm";
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

/**
 * Parse since/until query params into a [start, end] range. Accepts:
 *   ?since=2026-05-10           → 2026-05-10T00:00:00Z
 *   ?until=2026-05-17           → 2026-05-17T23:59:59.999Z (end-of-day)
 *   ?since=2026-05-10T08:30:00  → exact timestamp
 * Returns null bounds if the param is missing/invalid (caller treats as
 * "no filter on that side"). Always allows the caller to opt out of either
 * side independently.
 */
function pickDateRange(req: any): { since: Date | null; until: Date | null } {
  const q = (req as any)?.query ?? {};
  const parse = (s: string | undefined, endOfDay: boolean): Date | null => {
    if (!s) return null;
    let raw = String(s).trim();
    if (!raw) return null;
    // Bare YYYY-MM-DD → fill in time component.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      raw = endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };
  return {
    since: parse(q.since, false),
    until: parse(q.until, true)
  };
}

function dateRangeClause(col: any, range: { since: Date | null; until: Date | null }) {
  const parts: any[] = [];
  if (range.since) parts.push(gte(col, range.since));
  if (range.until) parts.push(lte(col, range.until));
  return parts.length === 0 ? undefined : and(...parts);
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
    const range = pickDateRange(req);
    const filter = and(
      sourceClause(source, bookings.isDemo),
      status !== "ALL"
        ? drizzleSql`${bookings.status}::text = ${status}`
        : undefined,
      dateRangeClause(bookings.createdAt, range)
    );

    const rows = await db
      .select()
      .from(bookings)
      .where(filter)
      .orderBy(desc(bookings.createdAt))
      .limit(500);
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
    const range = pickDateRange(req);
    const filter = and(
      sourceClause(source, drivers.isDemo),
      dateRangeClause(drivers.createdAt, range)
    );

    const rows = await db
      .select()
      .from(drivers)
      .where(filter)
      .orderBy(desc(drivers.lastSeenAt))
      .limit(500);
    return reply.send({ source, drivers: rows });
  });

  app.get("/api/v1/admin/users", adminGuard, async (req, reply) => {
    const source = pickSource(req);
    const range = pickDateRange(req);
    const filter = and(
      sourceClause(source, users.isDemo),
      dateRangeClause(users.createdAt, range)
    );

    const rows = await db
      .select()
      .from(users)
      .where(filter)
      .orderBy(desc(users.createdAt))
      .limit(500);
    return reply.send({ source, users: rows });
  });

  // Per-user detail: profile + last 100 bookings + lifetime totals.
  app.get("/api/v1/admin/users/:id", adminGuard, async (req, reply) => {
    const id = (req.params as any).id as string;
    const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!u) return reply.code(404).send({ error: "not_found" });

    const history = await db
      .select()
      .from(bookings)
      .where(eq(bookings.userId, id))
      .orderBy(desc(bookings.createdAt))
      .limit(100);

    const totals = {
      total: history.length,
      completed: history.filter((b) => b.status === "COMPLETED").length,
      cancelled: history.filter((b) => b.status === "CANCELLED").length,
      // Sum of payable across completed trips. Falls back to fareFinalInr if
      // payable hasn't been backfilled on old rows.
      lifetimePayableInr: history
        .filter((b) => b.status === "COMPLETED")
        .reduce((s, b) => s + (b.payableInr ?? b.fareFinalInr ?? 0), 0)
    };

    return reply.send({ user: u, bookings: history, totals });
  });

  // Toggle disabled flag on a user. Disabled users can't redeem an OTP and
  // their booking POSTs return 403. Existing JWTs remain valid until their
  // 30d expiry — admin should also call out to the user out-of-band if they
  // need them off the platform immediately.
  const patchDisabledSchema = z.object({ disabled: z.boolean() });
  // Driver PATCH also accepts kycVerified toggle (v1.0.11 — team feedback 1.10).
  const patchDriverSchema = z.object({
    disabled: z.boolean().optional(),
    kycVerified: z.boolean().optional()
  }).refine((d) => d.disabled !== undefined || d.kycVerified !== undefined, {
    message: "at_least_one_field_required"
  });

  app.patch("/api/v1/admin/users/:id", adminGuard, async (req, reply) => {
    const id = (req.params as any).id as string;
    const parsed = patchDisabledSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
    }
    const [updated] = await db
      .update(users)
      .set({ disabled: parsed.data.disabled, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return reply.send({ user: updated });
  });

  // Per-driver detail: profile + last 100 trips + lifetime trip count + earnings rollup.
  app.get("/api/v1/admin/drivers/:id", adminGuard, async (req, reply) => {
    const id = (req.params as any).id as string;
    const [d] = await db.select().from(drivers).where(eq(drivers.id, id)).limit(1);
    if (!d) return reply.code(404).send({ error: "not_found" });

    const history = await db
      .select()
      .from(bookings)
      .where(eq(bookings.driverId, id))
      .orderBy(desc(bookings.createdAt))
      .limit(100);

    const totals = {
      total: history.length,
      completed: history.filter((b) => b.status === "COMPLETED").length,
      cancelled: history.filter((b) => b.status === "CANCELLED").length,
      // Lifetime earnings = sum of payable across completed trips. Coupon-discounted
      // rides earn the driver whatever the patient actually paid (pilot rule —
      // payout reconciliation against promo budget happens out-of-band).
      lifetimeEarningsInr: history
        .filter((b) => b.status === "COMPLETED")
        .reduce((s, b) => s + (b.payableInr ?? b.fareFinalInr ?? 0), 0)
    };

    return reply.send({ driver: d, bookings: history, totals });
  });

  app.patch("/api/v1/admin/drivers/:id", adminGuard, async (req, reply) => {
    const id = (req.params as any).id as string;
    const parsed = patchDriverSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
    }
    const patch: any = { updatedAt: new Date() };
    if (parsed.data.disabled !== undefined) patch.disabled = parsed.data.disabled;
    if (parsed.data.kycVerified !== undefined) patch.kycVerified = parsed.data.kycVerified;
    const [updated] = await db
      .update(drivers)
      .set(patch)
      .where(eq(drivers.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return reply.send({ driver: updated });
  });

  // Feedback inbox — all bookings with at least one piece of feedback
  // (from user or from driver). Powers the admin /feedback tab.
  app.get("/api/v1/admin/feedback", adminGuard, async (req, reply) => {
    const source = pickSource(req);
    const sideFilter = String((req as any)?.query?.side ?? "all").toLowerCase(); // all | user | driver
    const range = pickDateRange(req);
    const conds: any[] = [sourceClause(source, bookings.isDemo)].filter(Boolean);
    if (sideFilter === "user") {
      conds.push(drizzleSql`${bookings.feedback} IS NOT NULL`);
    } else if (sideFilter === "driver") {
      conds.push(drizzleSql`${bookings.feedbackByDriver} IS NOT NULL`);
    } else {
      conds.push(drizzleSql`(${bookings.feedback} IS NOT NULL OR ${bookings.feedbackByDriver} IS NOT NULL)`);
    }
    const dr = dateRangeClause(bookings.completedAt, range);
    if (dr) conds.push(dr);
    const rows = await db
      .select()
      .from(bookings)
      .where(and(...conds))
      .orderBy(desc(bookings.completedAt))
      .limit(500);
    return reply.send({ source, side: sideFilter, bookings: rows });
  });

  /**
   * Analytics — per-day breakdown + rollups for the home Trends card.
   * Default window: last 30 days. Caller may pass ?since= & ?until=.
   * Returns:
   *   bookingsPerDay: [{ day: 'YYYY-MM-DD', count: N, completed: M }]
   *   stats: totals + rates
   *   emergencyMix: [{ type, count }] — top categories
   */
  app.get("/api/v1/admin/analytics", adminGuard, async (req, reply) => {
    const range = pickDateRange(req);
    const since = range.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const until = range.until ?? new Date();
    // postgres.js refuses Date objects in raw template-literal parameters
    // — it accepts ISO strings + casts via the explicit ::timestamptz.
    // Drizzle's eq/gte/lte helpers handle Dates directly.
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();

    const dateClause = and(gte(bookings.createdAt, since), lte(bookings.createdAt, until));
    const completedDateClause = and(dateClause, eq(bookings.status, "COMPLETED"));

    // ────────────────────────────────────────────────────────────────
    // Per-day series (bookings + completed)
    // ────────────────────────────────────────────────────────────────
    const perDay: any = await db.execute(drizzleSql`
      SELECT
        to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS count,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END)::int AS completed,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN COALESCE(admin_fare_override_inr, fare_final_inr) END), 0)::int AS gmv,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN payable_inr END), 0)::int AS revenue
      FROM bookings
      WHERE created_at >= ${sinceIso}::timestamptz AND created_at <= ${untilIso}::timestamptz
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    // ────────────────────────────────────────────────────────────────
    // Booking headline numbers
    // ────────────────────────────────────────────────────────────────
    const [totalRow] = await db.select({ c: count() }).from(bookings).where(dateClause);
    const [completedRow] = await db.select({ c: count() }).from(bookings).where(completedDateClause);
    const [cancelledRow] = await db.select({ c: count() }).from(bookings).where(and(dateClause, eq(bookings.status, "CANCELLED")));
    const [activeRow] = await db.select({ c: count() }).from(bookings).where(and(dateClause, drizzleSql`${bookings.status} IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')`));
    const [avgFareRow] = await db.select({
      avg: drizzleSql<number>`COALESCE(AVG(${bookings.fareFinalInr}), 0)`
    }).from(bookings).where(completedDateClause);
    const [avgRatingRow] = await db.select({
      avg: drizzleSql<number>`COALESCE(AVG(${bookings.rating}::float), 0)`
    }).from(bookings).where(and(dateClause, drizzleSql`${bookings.rating} IS NOT NULL`));

    // ────────────────────────────────────────────────────────────────
    // Money: GMV / Revenue / Discount / Profit (margin-based estimate)
    // ────────────────────────────────────────────────────────────────
    const moneyResult: any = await db.execute(drizzleSql`
      SELECT
        COALESCE(SUM(COALESCE(admin_fare_override_inr, fare_final_inr)), 0)::int AS gmv,
        COALESCE(SUM(payable_inr), 0)::int     AS revenue,
        COALESCE(SUM(discount_inr), 0)::int    AS discount_given,
        COUNT(*) FILTER (WHERE coupon_code IS NOT NULL)::int AS coupon_bookings,
        COUNT(*) FILTER (WHERE admin_fare_override_inr IS NOT NULL)::int AS overridden_bookings
      FROM bookings
      WHERE status = 'COMPLETED'
        AND created_at >= ${sinceIso}::timestamptz
        AND created_at <= ${untilIso}::timestamptz
    `);
    // postgres.js returns an array of rows; drizzle's typed wrapper may
    // shape it as either the array directly or `{ rows: [...] }`. Handle
    // both before indexing — bug fix from the v1.0.11.x analytics
    // shipping where double-indexing returned undefined for every money
    // field.
    const moneyRow = (Array.isArray(moneyResult) ? moneyResult : moneyResult.rows ?? [])[0] ?? {};
    const gmv = Number(moneyRow.gmv ?? 0);
    const revenue = Number(moneyRow.revenue ?? 0);
    const discountGiven = Number(moneyRow.discount_given ?? 0);
    const couponBookings = Number(moneyRow.coupon_bookings ?? 0);
    const overriddenBookings = Number(moneyRow.overridden_bookings ?? 0);
    // Profit estimate. JR doesn't have a real driver-payout model yet —
    // for the pilot we assume a 20% platform margin on revenue. Show as
    // an *estimate*; the team can override when a real payout schedule
    // lands in v1.2.
    const PROFIT_MARGIN_PCT = 20;
    const profitEstimate = Math.round((revenue * PROFIT_MARGIN_PCT) / 100);

    // Coupon usage breakdown (which codes, how often).
    const couponBreakdown: any = await db.execute(drizzleSql`
      SELECT coupon_code AS code,
             COUNT(*)::int AS uses,
             COALESCE(SUM(discount_inr), 0)::int AS total_discount
      FROM bookings
      WHERE coupon_code IS NOT NULL
        AND created_at >= ${sinceIso}::timestamptz
        AND created_at <= ${untilIso}::timestamptz
      GROUP BY 1
      ORDER BY 2 DESC
    `);

    // ────────────────────────────────────────────────────────────────
    // Driver + user counts (live = active right now, total = ever)
    // ────────────────────────────────────────────────────────────────
    const [totalDriversRow] = await db.select({ c: count() }).from(drivers);
    const [liveDriversRow] = await db.select({ c: count() }).from(drivers).where(drizzleSql`${drivers.status} IN ('AVAILABLE','ON_TRIP')`);
    const [onTripRow] = await db.select({ c: count() }).from(drivers).where(eq(drivers.status, "ON_TRIP"));
    const [verifiedDriversRow] = await db.select({ c: count() }).from(drivers).where(eq(drivers.kycVerified, true));
    const [totalUsersRow] = await db.select({ c: count() }).from(users);
    // "Active" user proxy = unique users who created a booking in the
    // selected window. Closest thing we have to MAU/DAU without
    // tracking app sessions.
    const activeUsersResult: any = await db.execute(drizzleSql`
      SELECT COUNT(DISTINCT user_id)::int AS c
      FROM bookings
      WHERE created_at >= ${sinceIso}::timestamptz
        AND created_at <= ${untilIso}::timestamptz
    `);
    const activeUsers = Number((Array.isArray(activeUsersResult) ? activeUsersResult : activeUsersResult.rows ?? [])[0]?.c ?? 0);
    // "Live" user proxy = users who currently have an in-flight booking
    // (REQUESTED through PICKED_UP).
    const liveUsersResult: any = await db.execute(drizzleSql`
      SELECT COUNT(DISTINCT user_id)::int AS c
      FROM bookings
      WHERE status IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')
    `);
    const liveUsers = Number((Array.isArray(liveUsersResult) ? liveUsersResult : liveUsersResult.rows ?? [])[0]?.c ?? 0);

    // ────────────────────────────────────────────────────────────────
    // Hour-of-day distribution (Asia/Kolkata) — split by side so the
    // dashboard can render a 2-line trend (user app booked / driver
    // accepted at hour H).
    // ────────────────────────────────────────────────────────────────
    const hourly: any = await db.execute(drizzleSql`
      WITH all_hours AS (SELECT generate_series(0,23) AS hour),
      user_hourly AS (
        SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
               COUNT(DISTINCT user_id)::int AS user_app
        FROM bookings
        WHERE created_at >= ${sinceIso}::timestamptz
          AND created_at <= ${untilIso}::timestamptz
        GROUP BY 1
      ),
      driver_hourly AS (
        SELECT EXTRACT(HOUR FROM accepted_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
               COUNT(DISTINCT driver_id)::int AS driver_app
        FROM bookings
        WHERE driver_id IS NOT NULL AND accepted_at IS NOT NULL
          AND accepted_at >= ${sinceIso}::timestamptz
          AND accepted_at <= ${untilIso}::timestamptz
        GROUP BY 1
      ),
      total_hourly AS (
        SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
               COUNT(*)::int AS count
        FROM bookings
        WHERE created_at >= ${sinceIso}::timestamptz
          AND created_at <= ${untilIso}::timestamptz
        GROUP BY 1
      )
      SELECT
        h.hour,
        COALESCE(t.count, 0) AS count,
        COALESCE(u.user_app, 0) AS user_app,
        COALESCE(d.driver_app, 0) AS driver_app
      FROM all_hours h
      LEFT JOIN total_hourly t USING (hour)
      LEFT JOIN user_hourly u USING (hour)
      LEFT JOIN driver_hourly d USING (hour)
      ORDER BY h.hour
    `);

    // ────────────────────────────────────────────────────────────────
    // Emergency mix
    // ────────────────────────────────────────────────────────────────
    const mix: any = await db.execute(drizzleSql`
      SELECT emergency_type::text AS type, COUNT(*)::int AS count
      FROM bookings
      WHERE created_at >= ${sinceIso}::timestamptz AND created_at <= ${untilIso}::timestamptz
      GROUP BY 1
      ORDER BY 2 DESC
    `);

    // ────────────────────────────────────────────────────────────────
    // App traffic — per-day distinct active users (user-app) and
    // distinct active drivers (driver-app), side by side. Proxy: a
    // "session" counts as either creating a booking (user side) or
    // accepting one (driver side). Closer to MAU/DAU than nothing,
    // and uses only what's already in the bookings table.
    // ────────────────────────────────────────────────────────────────
    const appTrafficResult: any = await db.execute(drizzleSql`
      SELECT
        day,
        SUM(user_active)::int   AS user_app,
        SUM(driver_active)::int AS driver_app
      FROM (
        SELECT
          to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day,
          1 AS user_active,
          0 AS driver_active,
          user_id::text AS actor,
          'u' AS side
        FROM bookings
        WHERE created_at >= ${sinceIso}::timestamptz
          AND created_at <= ${untilIso}::timestamptz
        GROUP BY 1, user_id

        UNION ALL

        SELECT
          to_char(date_trunc('day', accepted_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day,
          0 AS user_active,
          1 AS driver_active,
          driver_id::text AS actor,
          'd' AS side
        FROM bookings
        WHERE driver_id IS NOT NULL
          AND accepted_at IS NOT NULL
          AND accepted_at >= ${sinceIso}::timestamptz
          AND accepted_at <= ${untilIso}::timestamptz
        GROUP BY 1, driver_id
      ) per_actor
      GROUP BY day
      ORDER BY day ASC
    `);
    const appTraffic = Array.isArray(appTrafficResult) ? appTrafficResult : appTrafficResult.rows ?? [];

    // ────────────────────────────────────────────────────────────────
    // Trip averages — distance + duration for completed rides
    // ────────────────────────────────────────────────────────────────
    const tripAvgResult: any = await db.execute(drizzleSql`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - accepted_at)) / 60), 0)::float AS avg_minutes,
        COALESCE(AVG(EXTRACT(EPOCH FROM (accepted_at - created_at)) / 60), 0)::float AS avg_response_min,
        COALESCE(AVG(
          6371 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS((drop_lat - pickup_lat) / 2)), 2) +
            COS(RADIANS(pickup_lat)) * COS(RADIANS(drop_lat)) *
            POWER(SIN(RADIANS((drop_lng - pickup_lng) / 2)), 2)
          ))
        ), 0)::float AS avg_km
      FROM bookings
      WHERE status = 'COMPLETED'
        AND completed_at IS NOT NULL AND accepted_at IS NOT NULL
        AND drop_lat IS NOT NULL AND drop_lng IS NOT NULL
        AND created_at >= ${sinceIso}::timestamptz
        AND created_at <= ${untilIso}::timestamptz
    `);

    // ────────────────────────────────────────────────────────────────
    // Retention D1/D3/D7 — % of users who booked again N days after
    // their first booking. Computed on the entire dataset, not the
    // window (cohorts that started inside the window may not have
    // had time to retain past day 7).
    // ────────────────────────────────────────────────────────────────
    const retentionResult: any = await db.execute(drizzleSql`
      WITH first_booking AS (
        SELECT user_id, MIN(created_at) AS first_at
        FROM bookings
        GROUP BY user_id
        HAVING MIN(created_at) <= NOW() - INTERVAL '7 days'
      )
      SELECT
        COUNT(DISTINCT fb.user_id)::int AS cohort_size,
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.user_id = fb.user_id
            AND b.created_at >= fb.first_at + INTERVAL '1 day'
            AND b.created_at <  fb.first_at + INTERVAL '2 day'
        ) THEN fb.user_id END)::int AS d1,
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.user_id = fb.user_id
            AND b.created_at >= fb.first_at + INTERVAL '3 day'
            AND b.created_at <  fb.first_at + INTERVAL '4 day'
        ) THEN fb.user_id END)::int AS d3,
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM bookings b
          WHERE b.user_id = fb.user_id
            AND b.created_at >= fb.first_at + INTERVAL '7 day'
            AND b.created_at <  fb.first_at + INTERVAL '8 day'
        ) THEN fb.user_id END)::int AS d7
      FROM first_booking fb
    `);
    // Same shape-defensive unwrapping as money block — postgres.js arr
    // vs drizzle's {rows} wrapper.
    const unwrap = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);
    const rt = unwrap(retentionResult)[0] ?? {};
    const cohort = Number(rt.cohort_size ?? 0);
    const d1 = Number(rt.d1 ?? 0);
    const d3 = Number(rt.d3 ?? 0);
    const d7 = Number(rt.d7 ?? 0);
    const pct = (n: number) => (cohort > 0 ? Math.round((n / cohort) * 100) : 0);

    const total = Number(totalRow?.c ?? 0);
    const completed = Number(completedRow?.c ?? 0);
    const cancelled = Number(cancelledRow?.c ?? 0);
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
    const tripAvg = unwrap(tripAvgResult)[0] ?? {};

    return reply.send({
      since: since.toISOString(),
      until: until.toISOString(),
      bookingsPerDay: unwrap(perDay),
      emergencyMix: unwrap(mix),
      hourly: unwrap(hourly),
      couponBreakdown: unwrap(couponBreakdown),
      appTraffic,
      stats: {
        // bookings
        totalBookings: total,
        completed,
        cancelled,
        active: Number(activeRow?.c ?? 0),
        completionRate,
        cancellationRate,
        avgFareInr: Math.round(Number(avgFareRow?.avg ?? 0)),
        avgRating: Number((Number(avgRatingRow?.avg ?? 0)).toFixed(2)),
        // money
        gmvInr: gmv,
        revenueInr: revenue,
        discountGivenInr: discountGiven,
        couponBookings,
        overriddenBookings,
        // Per-completed-ride averages (cancelled rides shouldn't dilute these).
        avgGmvPerCompletedInr: completed > 0 ? Math.round(gmv / completed) : 0,
        avgRevenuePerCompletedInr: completed > 0 ? Math.round(revenue / completed) : 0,
        avgDiscountPerCompletedInr: completed > 0 ? Math.round(discountGiven / completed) : 0,
        profitEstimateInr: profitEstimate,
        profitMarginPct: PROFIT_MARGIN_PCT,
        // counts
        totalDrivers: Number(totalDriversRow?.c ?? 0),
        liveDrivers: Number(liveDriversRow?.c ?? 0),
        onTripDrivers: Number(onTripRow?.c ?? 0),
        verifiedDrivers: Number(verifiedDriversRow?.c ?? 0),
        totalUsers: Number(totalUsersRow?.c ?? 0),
        activeUsers,
        liveUsers,
        // trips
        avgTripMin: Number((Number(tripAvg.avg_minutes ?? 0)).toFixed(1)),
        avgResponseMin: Number((Number(tripAvg.avg_response_min ?? 0)).toFixed(1)),
        avgTripKm: Number((Number(tripAvg.avg_km ?? 0)).toFixed(2))
      },
      retention: {
        cohortSize: cohort,
        d1: { count: d1, pct: pct(d1) },
        d3: { count: d3, pct: pct(d3) },
        d7: { count: d7, pct: pct(d7) }
      }
    });
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

  // Admin fare override — ops can record what was actually billed
  // (e.g. to a hospital, off-platform). Optional note for audit trail.
  // Mobile apps NEVER receive this field; they keep showing the
  // user-facing fareEstimate / fareFinal / payable per their own logic.
  const adminFareSchema = z.object({
    fareOverrideInr: z.number().int().min(0).max(1_000_000).nullable().optional(),
    fareOverrideNote: z.string().max(500).nullable().optional()
  });
  app.patch("/api/v1/admin/bookings/:id", adminGuard, async (req, reply) => {
    const id = (req.params as any).id as string;
    const parsed = adminFareSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
    }
    const patch: any = {};
    if (parsed.data.fareOverrideInr !== undefined) patch.adminFareOverrideInr = parsed.data.fareOverrideInr;
    if (parsed.data.fareOverrideNote !== undefined) patch.adminFareOverrideNote = parsed.data.fareOverrideNote;
    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: "no_fields" });
    }
    const [updated] = await db
      .update(bookings)
      .set(patch)
      .where(eq(bookings.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return reply.send({ booking: updated });
  });

  /**
   * Destructive: delete a single booking + its events + its driver locations.
   * Used by ops to clean test bookings out of the analytics dataset.
   *
   * Auth: admin key (proxied through Vercel session) AND a separate
   * password sent in the body (JR_BOOKING_DELETE_PASSWORD env var on
   * Render). The double gate exists so an attacker who somehow gets a
   * valid admin session still can't wipe individual rides — and the
   * password is distinct from the dashboard login so it doesn't get
   * stored in the browser session.
   */
  app.post("/api/v1/admin/bookings/:id/delete", adminGuard, async (req, reply) => {
    const id = (req.params as any).id as string;
    const body = (req as any).body ?? {};
    const expected = process.env.JR_BOOKING_DELETE_PASSWORD ?? "dev-delete-password-change-in-prod";
    if (body.password !== expected) {
      return reply.code(401).send({ error: "delete_password_required" });
    }
    // CASCADE on the FK means booking_events go with the row; driver_locations
    // FK is ON DELETE SET NULL so they stay but lose the back-pointer (fine —
    // they're per-driver-per-second telemetry, no value to keep linked).
    try {
      const [removed] = await db
        .delete(bookings)
        .where(eq(bookings.id, id))
        .returning({ id: bookings.id, status: bookings.status });
      if (!removed) return reply.code(404).send({ error: "not_found" });
      return reply.send({ deleted: true, id: removed.id, lastStatus: removed.status });
    } catch (err: any) {
      return reply.code(500).send({ error: "delete_failed", message: String(err?.message ?? err) });
    }
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
