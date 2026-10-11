import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql } from "@jr/db";

const names = ["home.sos", "home.book", "home.history", "home.profile", "home.help", "booking.category", "booking.pickup", "booking.drop", "booking.landmark", "booking.submit", "booking.success", "booking.failure", "sos.category", "sos.success", "sos.failure", "driver.availability", "driver.accept", "driver.reject", "driver.trip", "driver.history", "driver.profile", "driver.help"] as const;
const bodySchema = z.object({ events: z.array(z.object({ id: z.string().uuid(), event: z.enum(names), ts: z.number().int().positive() }).strict()).min(1).max(50) }).strict();

export async function registerUiEventRoutes(app: FastifyInstance) {
  app.post("/api/v1/ui-events", { preHandler: [(app as any).authenticate], config: { rateLimit: { hook: "preHandler", keyGenerator: (req: any) => req.user?.sub ?? req.ip, max: 30, timeWindow: "1 minute" } } }, async (req: any, reply) => {
    const { role, sub } = req.user;
    if (!["user", "driver"].includes(role)) return reply.code(403).send({ error: "app_role_required" });
    const body = bodySchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "invalid_ui_events" });
    const events = body.data.events;
    if (events.some(e => (role === "driver") !== e.event.startsWith("driver.") || e.ts > Date.now() + 60_000)) return reply.code(400).send({ error: "invalid_ui_event_role_or_time" });
    // No arbitrary properties or free text: addresses, patient details and tokens cannot enter this table.
    const rows = events.filter(e => e.ts >= Date.now() - 30 * 86400_000).map(e => ({ id: e.id, event: e.event, captured_at: new Date(e.ts).toISOString() }));
    if (rows.length) await sql`INSERT INTO ui_events(id, actor_id, role, event, captured_at)
      SELECT e.id, ${sub}::uuid, ${role}, e.event, e.captured_at
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS e(id uuid, event text, captured_at timestamptz)
      ON CONFLICT (id) DO NOTHING`;
    return { ok: true, acknowledged: events.map(e => e.id) };
  });
}
