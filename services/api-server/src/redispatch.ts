import { db, bookings, sql as pgClient } from "@jr/db";
import { eq } from "drizzle-orm";
import { config } from "@jr/config";
import { startCascade } from "./sos-cascade";

/**
 * CR#2: return a booking to dispatch after a driver cancels for a
 * vehicle/operational/Other reason. Clears the driver, resets to REQUESTED,
 * excludes the cancelling driver from the next offer, and re-enters the same
 * dispatch path a fresh booking uses (SOS cascade if isSos, else broadcast).
 */
export async function redispatchBooking(app: any, bookingId: string, excludeDriverId: string) {
  // Reset the booking to an offerable state, detach the broken ambulance.
  await db
    .update(bookings)
    .set({ driverId: null, status: "REQUESTED", acceptedAt: null, arrivedAt: null, cancelWaitStartedAt: null })
    .where(eq(bookings.id, bookingId));

  // Exclude the cancelling driver from re-offer: a rejected sos_dispatch_attempts
  // row makes the cascade skip them (startCascade seeds its in-memory `rejected`
  // set from sos_dispatch_attempts rows with rejected_at set), mirroring a
  // normal reject. Relies on the sos_attempts_booking_driver_uniq index.
  await pgClient`
    INSERT INTO sos_dispatch_attempts (booking_id, driver_id, wave_number, rejected_at)
    VALUES (${bookingId}, ${excludeDriverId}, 0, now())
    ON CONFLICT (booking_id, driver_id) DO UPDATE SET rejected_at = now()
  `;

  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!b) return;

  if (b.isSos) {
    // Re-enter the cascade engine (same call the original SOS used in the
    // booking-create handler). Fire-and-forget, exactly like the create path.
    startCascade(app, bookingId);
  } else {
    // Re-enter the normal broadcast pool (same fan-out the create handler uses).
    try {
      await fetch(`${config.socketBaseUrl}/internal/booking-created`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
        body: JSON.stringify({ bookingId })
      });
    } catch (err) {
      app.log.warn({ err }, "redispatch fan-out hint failed");
    }
  }
}
