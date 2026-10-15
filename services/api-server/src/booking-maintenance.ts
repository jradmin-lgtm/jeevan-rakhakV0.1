import type { FastifyInstance } from "fastify";
import { sql } from "@jr/db";
import { config } from "@jr/config";
import { DISPATCH_WINDOW_MS, stopCascade } from "./sos-cascade";
import { pushToUser } from "./push";

const schedulers = new WeakMap<FastifyInstance, { timer: ReturnType<typeof setTimeout> | null; due: number; closed: boolean }>();
export function scheduleBookingExpiry(app: FastifyInstance, dispatchStartedAt: Date): void {
  let state = schedulers.get(app);
  if (!state) {
    state = { timer: null, due: Infinity, closed: false };
    schedulers.set(app, state);
    const owned = state;
    app.addHook("onClose", async () => { owned.closed = true; if (owned.timer) clearTimeout(owned.timer); });
  }
  if (state.closed) return;
  const due = +dispatchStartedAt + Math.max(config.bookingTimeoutSec * 1000, DISPATCH_WINDOW_MS) + 1000;
  if (state.timer && state.due <= due) return;
  if (state.timer) clearTimeout(state.timer);
  state.due = due;
  const owned = state;
  state.timer = setTimeout(() => {
    owned.timer = null; owned.due = Infinity;
    void expirePendingBookings(app).then(() => recoverBookingExpiry(app)).catch(err => {
      app.log.error({ err }, "[maintenance] expiry failed; pending work will retry");
      if (!owned.closed) scheduleBookingExpiry(app, new Date(Date.now() - Math.max(config.bookingTimeoutSec * 1000, DISPATCH_WINDOW_MS) + 29_000));
    });
  }, Math.max(1000, Math.min(due - Date.now(), 2_147_000_000)));
  state.timer.unref();
}

/** One startup read, then database work only while persisted normal rides are pending. */
export async function recoverBookingExpiry(app: FastifyInstance): Promise<void> {
  // Install lifecycle cleanup before Fastify starts listening, even when the
  // database has no pending bookings and therefore no timer is needed yet.
  if (!schedulers.has(app)) {
    const state = { timer: null as ReturnType<typeof setTimeout> | null, due: Infinity, closed: false };
    schedulers.set(app,state);
    app.addHook("onClose", async () => { state.closed = true; if (state.timer) clearTimeout(state.timer); });
  }
  const [row] = await sql`SELECT min(dispatch_started_at) AS started_at FROM bookings WHERE status = 'REQUESTED' AND is_sos = false AND driver_id IS NULL`;
  if (row?.started_at) scheduleBookingExpiry(app, new Date(row.started_at));
}

export async function expirePendingBookings(app: FastifyInstance): Promise<void> {
  const cutoff = new Date(Date.now() - Math.max(config.bookingTimeoutSec * 1000, DISPATCH_WINDOW_MS)).toISOString();
  const expired = await sql`
    UPDATE bookings SET status = 'TIMED_OUT', cancelled_at = now()
    WHERE status = 'REQUESTED' AND is_sos = false AND driver_id IS NULL AND dispatch_started_at < ${cutoff}
    RETURNING id, user_id`;
  for (const row of expired) {
    stopCascade(row.id);
    await sql`INSERT INTO booking_events (booking_id, actor, type) VALUES (${row.id}, 'system', 'booking.timed_out')`;
    await pushToUser(row.user_id, "booking_timed_out", {}, { bookingId: row.id, status: "TIMED_OUT" });
    app.log.info({ bookingId: row.id }, "[maintenance] normal booking expired");
  }
}
