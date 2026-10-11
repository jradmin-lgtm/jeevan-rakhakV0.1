import { db, bookings } from "@jr/db";
import { eq } from "drizzle-orm";
import { startCascade, stopCascade } from "./sos-cascade";

export async function redispatchBooking(app: any, bookingId: string, _excludeDriverId: string) {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) throw new Error("Redispatch booking missing");
  if (booking.status !== "REQUESTED" || booking.driverId) return;
  stopCascade(bookingId);
  await startCascade(app, bookingId);
}
