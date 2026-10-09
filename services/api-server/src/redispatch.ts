import { db, bookings } from "@jr/db";
import { eq } from "drizzle-orm";
import { config } from "@jr/config";
import { startCascade } from "./sos-cascade";
import { realtimeRequest } from "./realtime-http";

// The cancellation transaction already resets the booking and records the
// excluded driver. This helper only wakes dispatch for the committed state.
export async function redispatchBooking(app: any, bookingId: string, _excludeDriverId: string) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) throw new Error("Redispatch booking missing");
  if (booking.status !== "REQUESTED" || booking.driverId) return;
  if (booking.isSos) {
    startCascade(app, bookingId);
    return;
  }
  try {
    const response = await realtimeRequest(`${config.socketBaseUrl}/internal/booking-created`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
      body: JSON.stringify({ bookingId })
    });
    if (!response.ok) throw new Error(`Redispatch notification failed: HTTP ${response.status}`);
  } catch (error) {
    app.log.error({ error, bookingId }, "Redispatch saved; notification failed and polling must recover it");
  }
}
