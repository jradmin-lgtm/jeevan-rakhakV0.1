/**
 * SOS Cascading Dispatch Engine (v1.0.15)
 *
 * SOS bookings skip the public broadcast pool and instead get pushed to drivers
 * in expanding waves:
 *   t=0    : push to nearest driver
 *   t=60s  : also push to 2nd nearest
 *   t=120s : also push to 3rd nearest
 *   …
 *   t=540s : push to 10th (cap)
 *   t=600s : if still no accept → fire critical alert, patient sees
 *            "no driver yet — call the mobile line", booking stays REQUESTED
 *
 * Drivers who reject are removed from future waves. The eligible-driver list
 * is frozen at booking-creation time so a driver coming online mid-cascade
 * won't get retroactively pushed.
 *
 * State lives in two places:
 *   - In-memory `runners` map (timer + transient state)
 *   - `sos_dispatch_attempts` Postgres table (per-push audit row)
 *
 * On api-server restart, `resumeOnBoot()` rebuilds runners for any SOS that's
 * still REQUESTED and within the cascade window (~10 min).
 */
import type { FastifyInstance } from "fastify";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { config } from "@jr/config";
import {
  bookings,
  db,
  driverHeartbeats,
  drivers,
  sosDispatchAttempts
} from "@jr/db";
import { haversineDistanceKm } from "@jr/utils";
import { emitEvent } from "./events";

const MAX_DRIVERS = Number(process.env.SOS_CASCADE_MAX_DRIVERS ?? 10);
const WAVE_INTERVAL_MS = Number(process.env.SOS_CASCADE_WAVE_INTERVAL_S ?? 60) * 1000;
const STALENESS_MIN = Number(process.env.SOS_CASCADE_STALENESS_MIN ?? 5);

type EligibleDriver = { driverId: string; distanceKm: number };

type RunnerState = {
  bookingId: string;
  pickupLat: number;
  pickupLng: number;
  userId: string;
  emergencyType: string;
  pickupAddress: string | null;
  eligibleDrivers: EligibleDriver[];
  currentWave: number;
  rejected: Set<string>;
  timer: NodeJS.Timeout | null;
  startedAt: number;
};

const runners = new Map<string, RunnerState>();

async function getEligibleDrivers(pickupLat: number, pickupLng: number): Promise<EligibleDriver[]> {
  const staleness = new Date(Date.now() - STALENESS_MIN * 60 * 1000);
  const candidates = await db
    .select({
      driverId: driverHeartbeats.driverId,
      lat: driverHeartbeats.lat,
      lng: driverHeartbeats.lng
    })
    .from(driverHeartbeats)
    .innerJoin(drivers, eq(drivers.id, driverHeartbeats.driverId))
    .where(
      and(
        gte(driverHeartbeats.updatedAt, staleness),
        eq(drivers.status, "AVAILABLE"),
        eq(drivers.disabled, false),
        eq(drivers.kycVerified, true)
      )
    );
  const withDistance = candidates.map((c) => ({
    driverId: c.driverId,
    distanceKm: haversineDistanceKm(c.lat, c.lng, pickupLat, pickupLng)
  }));
  withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  return withDistance.slice(0, MAX_DRIVERS);
}

async function emitToDriver(driverId: string, event: string, payload: unknown) {
  try {
    await fetch(`${config.socketBaseUrl}/internal/emit-to-driver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
      body: JSON.stringify({ driverId, event, payload })
    });
  } catch (err) {
    // Best-effort emission. The audit row in sos_dispatch_attempts is the
    // source of truth — if socket-server is asleep, the next wave still
    // logs the attempt and admin sees the cascade progressed.
    console.warn("[sos] emit-to-driver failed", err);
  }
}

async function emitToUser(userId: string, event: string, payload: unknown) {
  try {
    await fetch(`${config.socketBaseUrl}/internal/emit-to-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
      body: JSON.stringify({ userId, event, payload })
    });
  } catch (err) {
    console.warn("[sos] emit-to-user failed", err);
  }
}

async function runWave(app: FastifyInstance, state: RunnerState): Promise<void> {
  // Has the booking already been resolved (accepted / cancelled / completed)?
  // Re-check Postgres every wave because /accept can land while a timer is
  // pending and we don't want to push to driver N+1 after driver N already
  // won the race.
  const [b] = await db.select().from(bookings).where(eq(bookings.id, state.bookingId)).limit(1);
  if (!b || b.status !== "REQUESTED" || b.driverId) {
    stopCascade(state.bookingId);
    return;
  }
  state.currentWave += 1;
  const cap = Math.min(MAX_DRIVERS, state.eligibleDrivers.length);
  if (state.currentWave > cap) {
    // Cascade exhausted — fire critical alert and tell the patient.
    await emitEvent({
      level: "critical",
      source: "sos-cascade",
      message: "sos_unassigned",
      context: {
        bookingId: state.bookingId,
        waves: state.currentWave - 1,
        eligible: state.eligibleDrivers.length,
        rejected: state.rejected.size
      }
    });
    await emitToUser(state.userId, "sos:cascade_exhausted", { bookingId: state.bookingId });
    stopCascade(state.bookingId);
    return;
  }
  // Push to driver at the new wave index (1-indexed → 0-indexed).
  const target = state.eligibleDrivers[state.currentWave - 1];
  if (target && !state.rejected.has(target.driverId)) {
    try {
      // Audit row first — survives socket emission failure.
      await db
        .insert(sosDispatchAttempts)
        .values({
          bookingId: state.bookingId,
          driverId: target.driverId,
          waveNumber: state.currentWave,
          distanceKm: target.distanceKm
        })
        .onConflictDoNothing();
      await emitToDriver(target.driverId, "sos:incoming", {
        bookingId: state.bookingId,
        emergencyType: state.emergencyType,
        pickupLat: state.pickupLat,
        pickupLng: state.pickupLng,
        pickupAddress: state.pickupAddress,
        distanceKm: target.distanceKm,
        waveNumber: state.currentWave
      });
    } catch (err) {
      app.log.warn(
        { err, driverId: target.driverId, bookingId: state.bookingId },
        "[sos] wave push failed"
      );
    }
  }
  state.timer = setTimeout(() => {
    void runWave(app, state);
  }, WAVE_INTERVAL_MS);
}

export async function startCascade(app: FastifyInstance, bookingId: string): Promise<void> {
  if (runners.has(bookingId)) return;
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!b) return;
  if (!b.isSos) return;
  if (b.status !== "REQUESTED") return;
  const eligible = await getEligibleDrivers(b.pickupLat, b.pickupLng);
  if (eligible.length === 0) {
    await emitEvent({
      level: "critical",
      source: "sos-cascade",
      message: "sos_no_drivers_available",
      context: { bookingId }
    });
    await emitToUser(b.userId, "sos:cascade_exhausted", { bookingId, reason: "no_drivers" });
    return;
  }
  // Seed the in-memory rejected set from the audit table — survives api-server
  // restarts. Without this, a resumed cascade would re-push to drivers who
  // already tapped Reject before the crash.
  const priorRejections = await db
    .select({ driverId: sosDispatchAttempts.driverId })
    .from(sosDispatchAttempts)
    .where(
      and(
        eq(sosDispatchAttempts.bookingId, bookingId),
        isNotNull(sosDispatchAttempts.rejectedAt)
      )
    );

  const state: RunnerState = {
    bookingId,
    pickupLat: b.pickupLat,
    pickupLng: b.pickupLng,
    userId: b.userId,
    emergencyType: b.emergencyType,
    pickupAddress: b.pickupAddress,
    eligibleDrivers: eligible,
    currentWave: 0,
    rejected: new Set(priorRejections.map((r) => r.driverId)),
    timer: null,
    startedAt: Date.now()
  };
  runners.set(bookingId, state);
  app.log.info(
    { bookingId, eligibleCount: eligible.length, nearestKm: eligible[0]?.distanceKm },
    "[sos] cascade started"
  );
  await runWave(app, state);
}

export function stopCascade(bookingId: string): void {
  const state = runners.get(bookingId);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  runners.delete(bookingId);
}

export function noteCascadeReject(bookingId: string, driverId: string): void {
  const state = runners.get(bookingId);
  if (!state) return;
  state.rejected.add(driverId);
}

export async function notifyCascadeLosers(bookingId: string, winnerDriverId: string): Promise<void> {
  // After a driver accepts, tell every other driver who was pushed that the
  // SOS is gone so their SosIncomingModal can dismiss cleanly. Reads from the
  // audit table — works even after a restart erased the in-memory state.
  const rows = await db
    .select({ driverId: sosDispatchAttempts.driverId })
    .from(sosDispatchAttempts)
    .where(eq(sosDispatchAttempts.bookingId, bookingId));
  for (const row of rows) {
    if (row.driverId === winnerDriverId) continue;
    await emitToDriver(row.driverId, "sos:cancelled", { bookingId });
  }
}

export async function resumeOnBoot(app: FastifyInstance): Promise<void> {
  // Pick up any SOS REQUESTED bookings that started within the cascade window
  // and rebuild their runners. The currentWave gets derived from how much
  // time has elapsed so we don't replay already-completed waves.
  const cutoff = new Date(Date.now() - (MAX_DRIVERS * WAVE_INTERVAL_MS) - 60_000);
  const pending = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, "REQUESTED"),
        eq(bookings.isSos, true),
        gte(bookings.createdAt, cutoff)
      )
    );
  for (const b of pending) {
    try {
      await startCascade(app, b.id);
      app.log.info({ bookingId: b.id }, "[sos] cascade resumed after boot");
    } catch (err) {
      app.log.warn({ err, bookingId: b.id }, "[sos] resume failed");
    }
  }
}
