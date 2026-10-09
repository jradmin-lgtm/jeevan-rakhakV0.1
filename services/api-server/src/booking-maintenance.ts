import type { FastifyInstance } from "fastify";
import { sql } from "@jr/db";
import { config } from "@jr/config";
import { pushToUser } from "./push";

export async function expirePendingBookings(app: FastifyInstance): Promise<void> {
  const cutoff = new Date(Date.now() - config.bookingTimeoutSec * 1000).toISOString();
  const expired = await sql`
    UPDATE bookings SET status = 'TIMED_OUT', cancelled_at = now()
    WHERE status = 'REQUESTED' AND is_sos = false AND driver_id IS NULL AND created_at < ${cutoff}
    RETURNING id, user_id`;
  for (const row of expired) {
    await sql`INSERT INTO booking_events (booking_id, actor, type) VALUES (${row.id}, 'system', 'booking.timed_out')`;
    await pushToUser(row.user_id, "booking_timed_out", {}, { bookingId: row.id, status: "TIMED_OUT" });
    app.log.info({ bookingId: row.id }, "[maintenance] normal booking expired");
  }
}
