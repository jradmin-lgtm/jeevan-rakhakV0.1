import type { FastifyInstance } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { sql } from "@jr/db";
import { config } from "@jr/config";
import { realtimeRequest } from "../realtime-http";
import { stopCascade, notifyCascadeLosers } from "../sos-cascade";
import { dismissPushToDriver, dismissPushToUser } from "../push";
import { autoResolveSafetyForBooking } from "./safety";

const schema = z.object({
  id: z.string().uuid(), targetId: z.string().uuid(),
  action: z.enum(["cancel_trip", "force_offline", "release_offline", "restrict_user", "restore_user"]),
  reason: z.string().trim().min(4).max(500), password: z.string().min(1).max(512),
  email: z.string().email().optional()
}).strict();

export async function registerAdminOperationRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/operations", {
    preHandler: [(app as any).requireAdminKey],
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (req: any, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_input" });
    const input = parsed.data;
    const expected = process.env.JR_BOOKING_DELETE_PASSWORD;
    if (!expected || expected === "dev-delete-password-change-in-prod") {
      req.log.error("Administrative action password unavailable");
      return reply.code(503).send({ error: "admin_action_password_not_configured" });
    }
    const supplied = createHash("sha256").update(input.password).digest();
    const required = createHash("sha256").update(expected).digest();
    if (!timingSafeEqual(supplied, required)) return reply.code(401).send({ error: "admin_action_password_required" });
    const hash = createHash("sha256").update(JSON.stringify([input.action,input.targetId,input.reason,input.email?.toLowerCase() ?? null])).digest("hex");
    const result = await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${input.id},0))`;
      const [prior] = await tx`SELECT request_hash FROM admin_actions WHERE id=${input.id}`;
      if (prior) return prior.request_hash === hash ? { replay: true } : { error: "action_id_conflict", code: 409 };
      let booking: any;
      if (input.action === "cancel_trip") {
        const [b] = await tx`SELECT * FROM bookings WHERE id=${input.targetId} FOR UPDATE`;
        if (!b) return { error: "booking_not_found", code: 404 };
        if (!["REQUESTED","ACCEPTED","ARRIVED","PICKED_UP"].includes(b.status)) return { error: "trip_already_finished", code: 409 };
        await tx`UPDATE bookings SET status='CANCELLED',cancelled_at=now() WHERE id=${b.id}`;
        if (b.driver_id) await tx`UPDATE drivers SET status=CASE WHEN admin_offline OR disabled THEN 'OFFLINE'::driver_status ELSE 'AVAILABLE'::driver_status END,updated_at=now() WHERE id=${b.driver_id}`;
        await tx`INSERT INTO booking_events(booking_id,actor,type,payload_json) VALUES(${b.id},'admin','booking.cancelled',${JSON.stringify({reason:input.reason,actionId:input.id,source:'admin'})})`;
        booking = b;
      } else if (input.action === "force_offline" || input.action === "release_offline") {
        const [d] = await tx`SELECT id FROM drivers WHERE id=${input.targetId} FOR UPDATE`;
        if (!d) return { error: "driver_not_found", code: 404 };
        if (input.action === "force_offline") {
          const [active] = await tx`SELECT id FROM bookings WHERE driver_id=${d.id} AND status IN ('ACCEPTED','ARRIVED','PICKED_UP') LIMIT 1`;
          if (active) return { error: "cancel_active_trip_first", code: 409 };
          await tx`UPDATE drivers SET admin_offline=true,status='OFFLINE',updated_at=now() WHERE id=${d.id}`;
        } else await tx`UPDATE drivers SET admin_offline=false,updated_at=now() WHERE id=${d.id}`;
      } else {
        const [u] = await tx`SELECT id,email FROM users WHERE id=${input.targetId} FOR UPDATE`;
        if (!u) return { error: "user_not_found", code: 404 };
        if (u.email && (!input.email || u.email.trim().toLowerCase() !== input.email.trim().toLowerCase())) return { error: "registered_email_does_not_match", code: 409 };
        await tx`UPDATE users SET disabled=${input.action === "restrict_user"},updated_at=now() WHERE id=${u.id}`;
      }
      await tx`INSERT INTO admin_actions(id,action,target_id,reason,request_hash) VALUES(${input.id},${input.action},${input.targetId},${input.reason},${hash})`;
      return { booking, replay: false };
    });
    if ("error" in result) return reply.code(result.code!).send({ error: result.error });
    // Repeat delivery on a retried cancellation too. The state mutation and audit
    // remain exactly once; polling always recovers the committed state.
    if (input.action === "cancel_trip") {
      stopCascade(input.targetId);
      try {
        await notifyCascadeLosers(input.targetId, "");
        const b = result.booking ?? (await sql`SELECT * FROM bookings WHERE id=${input.targetId}`)[0];
        if (b) {
          await dismissPushToUser(b.user_id,b.id);
          if (b.driver_id) await dismissPushToDriver(b.driver_id,b.id);
          await autoResolveSafetyForBooking(b.id);
          const events = [realtimeRequest(`${config.socketBaseUrl}/internal/booking-event`, {method:"POST",headers:{"Content-Type":"application/json","x-internal":config.internalApiSecret},body:JSON.stringify({bookingId:b.id,type:"booking.cancelled",actor:"admin"})})];
          if (b.dest_hospital_id) events.push(realtimeRequest(`${config.socketBaseUrl}/internal/emit-to-hospital`, {method:"POST",headers:{"Content-Type":"application/json","x-internal":config.internalApiSecret},body:JSON.stringify({hospitalId:b.dest_hospital_id,event:"hospital:booking_update",payload:{bookingId:b.id}})}));
          await Promise.all(events);
        }
      } catch (error) { req.log.error({error,actionId:input.id},"Admin cancellation saved; realtime delivery needs refresh"); }
    }
    return { ok: true, actionId: input.id, replay: result.replay };
  });
}
