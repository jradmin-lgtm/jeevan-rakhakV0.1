import { and, eq, lt } from "drizzle-orm";
import { config } from "@jr/config";
import { bookings, db, drivers } from "@jr/db";

const TIMEOUT_MS = config.bookingTimeoutSec * 1000;
const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_DRIVER_MS = 90_000;

async function reapTimedOutBookings() {
  const cutoff = new Date(Date.now() - TIMEOUT_MS);
  // v1.2.7: NEVER auto-timeout SOS bookings. SOS runs the cascade (20s waves)
  // and, by design, STAYS `REQUESTED` after the cascade exhausts so the patient
  // sees "call the mobile line" and any cascade-pushed driver keeps the request
  // in their Incoming list until they accept/reject (or ops cancels it). The
  // 90s booking timeout is for NORMAL bookings only — applying it to SOS was
  // silently dropping live emergencies from the driver queue + killing the
  // cascade after 90s. `is_sos = false` exempts them.
  const stale = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(and(eq(bookings.status, "REQUESTED"), eq(bookings.isSos, false), lt(bookings.createdAt, cutoff)));
  for (const row of stale) {
    await db
      .update(bookings)
      .set({ status: "TIMED_OUT", cancelledAt: new Date() })
      .where(eq(bookings.id, row.id));
    console.log(`[worker] booking ${row.id} timed out`);
  }
}

async function reapStaleDrivers() {
  const cutoff = new Date(Date.now() - STALE_DRIVER_MS);
  const updated = await db
    .update(drivers)
    .set({ status: "OFFLINE" })
    .where(and(eq(drivers.status, "AVAILABLE"), lt(drivers.lastSeenAt, cutoff)))
    .returning({ id: drivers.id });
  if (updated.length) {
    console.log(`[worker] marked ${updated.length} stale drivers offline`);
  }
}

async function tick() {
  const now = new Date().toISOString();
  console.log(`[worker] heartbeat at ${now}`);
  try {
    await reapTimedOutBookings();
  } catch (err) {
    console.warn("[worker] booking reap failed", err);
  }
  try {
    await reapStaleDrivers();
  } catch (err) {
    console.warn("[worker] driver reap failed", err);
  }
}

setInterval(tick, HEARTBEAT_INTERVAL_MS);
void tick();
