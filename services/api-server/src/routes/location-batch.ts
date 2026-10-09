import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "@jr/db";

const pointSchema = z.object({
  bookingId: z.string().uuid(),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  speedKmh: z.number().finite().min(0).max(300).optional(),
  headingDeg: z.number().finite().min(0).max(360).optional(),
  ts: z.number().int().positive()
});
const batchSchema = z.object({ points: z.array(pointSchema).min(1).max(100) });

export async function registerLocationBatchRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/location-batch", {
    preHandler: [(app as any).authenticate],
    config: { rateLimit: { hook: "preHandler", keyGenerator: (req: any) => req.user?.sub ?? req.ip, max: 60, timeWindow: "1 minute" } }
  }, async (req: any, reply) => {
    if (req.user.role !== "driver") return reply.code(403).send({ error: "driver_only" });
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_location_batch", details: parsed.error.flatten() });
    const now = Date.now();
    if (parsed.data.points.some(p => p.ts > now + 10_000)) return reply.code(400).send({ error: "future_location_fix" });
    const points = [...new Map(parsed.data.points.map(p => [`${p.bookingId}:${p.ts}`, p])).values()];
    const bookingIds = [...new Set(points.map(p => p.bookingId))];
    const result = await sql.begin(async tx => {
      // Trip transitions lock the booking before its driver. Keep the same order.
      const owned = await tx`SELECT id, status FROM bookings WHERE id = ANY(${bookingIds}::uuid[]) AND driver_id = ${req.user.sub} ORDER BY id FOR SHARE`;
      if (owned.length !== bookingIds.length) return { forbidden: true as const };
      const driver = await tx`SELECT id FROM drivers WHERE id = ${req.user.sub} FOR UPDATE`;
      if (!driver.length) return { forbidden: true as const };
      const valid = points.filter(p => now - p.ts <= 24 * 60 * 60 * 1000);
      if (valid.length) {
        const rows = valid.map(p => ({ booking_id: p.bookingId, lat: p.lat, lng: p.lng, speed_kmh: p.speedKmh ?? null, heading_deg: p.headingDeg ?? null, recorded_at: new Date(p.ts).toISOString() }));
        await tx`INSERT INTO driver_locations (driver_id, booking_id, lat, lng, speed_kmh, heading_deg, recorded_at)
          SELECT ${req.user.sub}::uuid, p.booking_id, p.lat, p.lng, p.speed_kmh, p.heading_deg, p.recorded_at
          FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS p(booking_id uuid, lat double precision, lng double precision, speed_kmh double precision, heading_deg double precision, recorded_at timestamptz)
          WHERE NOT EXISTS (SELECT 1 FROM driver_locations old WHERE old.driver_id = ${req.user.sub} AND old.booking_id = p.booking_id AND old.recorded_at = p.recorded_at)`;
        const activeIds = new Set(owned.filter(b => ["ACCEPTED", "ARRIVED", "PICKED_UP"].includes(b.status)).map(b => b.id));
        const latest = valid.filter(p => activeIds.has(p.bookingId) && now - p.ts <= 120_000).sort((a, b) => b.ts - a.ts)[0];
        if (latest) {
          const at = new Date(latest.ts).toISOString();
          await tx`UPDATE drivers SET last_lat = ${latest.lat}, last_lng = ${latest.lng}, last_seen_at = ${at}, updated_at = NOW()
            WHERE id = ${req.user.sub} AND (last_seen_at IS NULL OR last_seen_at < ${at})`;
        }
      }
      return { forbidden: false as const, accepted: valid.length, expired: points.length - valid.length };
    });
    if (result.forbidden) return reply.code(403).send({ error: "not_assigned_to_booking" });
    return { ok: true, accepted: result.accepted, expired: result.expired };
  });
}
