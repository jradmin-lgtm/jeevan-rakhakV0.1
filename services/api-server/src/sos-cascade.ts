import { realtimeRequest } from "./realtime-http";
/**
 * SOS Cascading Dispatch Engine (v1.0.15)
 *
 * SOS bookings skip the public broadcast pool and instead get pushed to drivers
 * in expanding waves (v1.1.0 / CR#2 — wave interval cut 60s → 20s for faster
 * emergency escalation):
 *   t=0    : push to nearest driver
 *   t=20s  : also push to 2nd nearest
 *   t=40s  : also push to 3rd nearest
 *   …
 *   t=180s : push to 10th (cap)
 *   t=200s : if still no accept → fire critical alert, patient sees
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
import { and, eq, gte, isNotNull, sql as drizzleSql } from "drizzle-orm";
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
import { getRoadDistances } from "./google-maps";
import { dismissPushToDriver, pushToDriver } from "./push";

const MAX_DRIVERS = Number(process.env.SOS_CASCADE_MAX_DRIVERS ?? 10);
// v1.1.0 (CR#2): default cut 60s → 20s. Still env-overridable on Render.
const WAVE_INTERVAL_MS = Number(process.env.SOS_CASCADE_WAVE_INTERVAL_S ?? 20) * 1000;
const STALENESS_MIN = Number(process.env.SOS_CASCADE_STALENESS_MIN ?? 5);

type EligibleDriver = { driverId: string; distanceKm: number };

type RunnerState = { bookingId: string; timer: NodeJS.Timeout | null; stopped: boolean };
const runners = new Map<string, RunnerState>();
const starting = new Map<string, Promise<void>>();
export const DISPATCH_WINDOW_MS = MAX_DRIVERS * WAVE_INTERVAL_MS + 30_000;

async function getEligibleDrivers(pickupLat: number, pickupLng: number): Promise<EligibleDriver[]> {
  const staleness = new Date(Date.now() - STALENESS_MIN * 60 * 1000);
  // v1.1.0 (CR#4): drive eligibility off the `drivers` table (the source of
  // truth for AVAILABLE/kyc/disabled) and LEFT JOIN heartbeats, instead of
  // INNER-joining heartbeats. The old INNER join silently dropped any
  // AVAILABLE driver whose heartbeat hadn't landed in the last 5 min (the
  // heartbeat hook only fires while online + foregrounded), producing an
  // empty eligible set → "sos_no_drivers_available" while drivers were in
  // fact online. We now fall back to the driver's last-known GPS
  // (drivers.lastLat/lastLng, bumped by /availability + /location) when the
  // heartbeat is stale or missing.
  const candidates = await db
    .select({
      driverId: drivers.id,
      hbLat: driverHeartbeats.lat,
      hbLng: driverHeartbeats.lng,
      hbAt: driverHeartbeats.updatedAt,
      lastLat: drivers.lastLat,
      lastLng: drivers.lastLng,
      lastSeenAt: drivers.lastSeenAt
    })
    .from(drivers)
    .leftJoin(driverHeartbeats, eq(driverHeartbeats.driverId, drivers.id))
    .where(
      and(
        eq(drivers.status, "AVAILABLE"),
        eq(drivers.disabled, false),
        eq(drivers.adminOffline, false),
        eq(drivers.kycVerified, true),
        // Defense in depth (overlap guard): never even target a driver who
        // currently holds an active assigned booking. A driver mid-ride should
        // be ON_TRIP (so the AVAILABLE filter usually covers this), but if a
        // status ever lags this NOT EXISTS keeps the cascade from pushing an
        // SOS to a busy driver. All other eligibility logic is unchanged.
        drizzleSql`NOT EXISTS (
          SELECT 1 FROM ${bookings} AS active_b
          WHERE active_b.driver_id = ${drivers.id}
            AND active_b.status IN ('ACCEPTED','ARRIVED','PICKED_UP')
        )`
      )
    );
  const withDistance = candidates
    .map((c) => {
      const hbFresh = c.hbAt != null && c.hbAt >= staleness;
      const seenFresh = c.lastSeenAt != null && c.lastSeenAt >= staleness;
      // Prefer the heartbeat position; fall back to last-known GPS. Skip a
      // driver only when we have NO usable recent position at all.
      const lat = hbFresh ? c.hbLat : seenFresh ? c.lastLat : null;
      const lng = hbFresh ? c.hbLng : seenFresh ? c.lastLng : null;
      if (lat == null || lng == null) return null;
      return {
        driverId: c.driverId,
        lat,
        lng,
        distanceKm: haversineDistanceKm(lat, lng, pickupLat, pickupLng)
      };
    })
    .filter((d): d is { driverId: string; lat: number; lng: number; distanceKm: number } => d !== null);
  withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
  const pool = withDistance.slice(0, MAX_DRIVERS);

  // 2026-08-17 exploration (FLAG_GOOGLE_DISPATCH_ENABLED, default off): a
  // straight-line-nearest driver can be further by actual road (river/one-way
  // loop/highway divider) than the next-nearest by straight line. Re-rank the
  // already-haversine-bounded pool by real driving time via one batched
  // Distance Matrix call. On any failure this returns null and the pool keeps
  // its haversine order — the cascade never blocks on a third-party API.
  if (config.googleDispatchRankingEnabled && pool.length > 0) {
    const roadDistances = await getRoadDistances(
      pool.map((p) => ({ id: p.driverId, lat: p.lat, lng: p.lng })),
      pickupLat,
      pickupLng
    );
    if (roadDistances) {
      pool.sort((a, b) => {
        const ra = roadDistances.get(a.driverId);
        const rb = roadDistances.get(b.driverId);
        return (ra?.durationMin ?? Infinity) - (rb?.durationMin ?? Infinity);
      });
      for (const p of pool) {
        const r = roadDistances.get(p.driverId);
        if (r) p.distanceKm = r.distanceKm;
      }
    }
  }

  return pool.map((p) => ({ driverId: p.driverId, distanceKm: p.distanceKm }));
}

async function emitToDriver(driverId: string, event: string, payload: unknown) {
  try {
    await realtimeRequest(`${config.socketBaseUrl}/internal/emit-to-driver`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
      signal: AbortSignal.timeout(10_000),
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
    await realtimeRequest(`${config.socketBaseUrl}/internal/emit-to-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
      body: JSON.stringify({ userId, event, payload })
    });
  } catch (err) {
    console.warn("[sos] emit-to-user failed", err);
  }
}

function schedule(app: FastifyInstance, state: RunnerState, delay: number) {
  if (state.stopped) return;
  state.timer = setTimeout(() => {
    void runWave(app, state).catch(error => {
      app.log.error({ error, bookingId: state.bookingId }, "Dispatch wave failed; retry scheduled");
      schedule(app, state, WAVE_INTERVAL_MS);
    });
  }, Math.max(100, delay));
}

async function runWave(app: FastifyInstance, state: RunnerState): Promise<void> {
  if (state.stopped) return;
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, state.bookingId)).limit(1);
  if (!booking || booking.status !== "REQUESTED" || booking.driverId) { stopCascade(state.bookingId); return; }
  const eligible = await getEligibleDrivers(booking.pickupLat, booking.pickupLng);
  const outcome = await db.transaction(async tx => {
    // Serialise offers with acceptance and cancellation, including across API processes.
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, state.bookingId)).limit(1).for("update");
    if (!b || b.status !== "REQUESTED" || b.driverId) return { done: true as const };
    const rows = await tx.select().from(sosDispatchAttempts).where(eq(sosDispatchAttempts.bookingId, b.id));
    const cycle = rows.filter(a => a.pushedAt >= b.dispatchStartedAt && a.waveNumber > 0);
    const lastAt = Math.max(+b.dispatchStartedAt - WAVE_INTERVAL_MS, ...cycle.map(a => +a.pushedAt));
    const delay = lastAt + WAVE_INTERVAL_MS - Date.now();
    if (delay > 0) return { delay };
    if (cycle.length >= MAX_DRIVERS || (!b.isSos && Date.now() - +b.dispatchStartedAt >= DISPATCH_WINDOW_MS)) return { exhausted: b };
    const target = eligible.find(d => !rows.some(a => a.driverId === d.driverId && (a.rejectedAt || a.pushedAt >= b.dispatchStartedAt)));
    if (!target) return Date.now() - +b.dispatchStartedAt >= DISPATCH_WINDOW_MS ? { exhausted: b } : { delay: WAVE_INTERVAL_MS };
    const wave = cycle.length + 1;
    await tx.insert(sosDispatchAttempts).values({ bookingId: b.id, driverId: target.driverId, waveNumber: wave, distanceKm: target.distanceKm })
      .onConflictDoUpdate({ target: [sosDispatchAttempts.bookingId, sosDispatchAttempts.driverId], set: { waveNumber: wave, distanceKm: target.distanceKm, pushedAt: new Date(), acceptedAt: null, rejectedAt: null } });
    return { b, target, wave };
  });
  if ("done" in outcome) { stopCascade(state.bookingId); return; }
  if ("exhausted" in outcome && outcome.exhausted) {
    await emitEvent({ level: outcome.exhausted.isSos ? "critical" : "warn", source: "sos-cascade", message: "dispatch_exhausted", context: { bookingId: state.bookingId } });
    await emitToUser(outcome.exhausted.userId, "sos:cascade_exhausted", { bookingId: state.bookingId });
    stopCascade(state.bookingId); return;
  }
  if ("b" in outcome && outcome.b && outcome.target) {
    const { b, target, wave } = outcome;
    const [current] = await db.select({ status: bookings.status, dispatchStartedAt: bookings.dispatchStartedAt }).from(bookings).where(eq(bookings.id, b.id));
    if (state.stopped || current?.status !== "REQUESTED" || +current.dispatchStartedAt !== +b.dispatchStartedAt) { stopCascade(b.id); return; }
    await emitToDriver(target.driverId, b.isSos ? "sos:incoming" : "booking:offered", {
      bookingId: b.id, emergencyType: b.emergencyType, pickupLat: b.pickupLat, pickupLng: b.pickupLng,
      pickupAddress: b.pickupAddress, pickupLandmark: b.pickupLandmark, displayId: b.displayId,
      patientName: b.patientName, createdAt: b.createdAt, isSos: b.isSos, distanceKm: target.distanceKm, waveNumber: wave
    });
    const [beforePush] = await db.select({ status: bookings.status, dispatchStartedAt: bookings.dispatchStartedAt }).from(bookings).where(eq(bookings.id, b.id));
    if (state.stopped || beforePush?.status !== "REQUESTED" || +beforePush.dispatchStartedAt !== +b.dispatchStartedAt) { stopCascade(b.id); return; }
    await pushToDriver(target.driverId, b.isSos ? "sos_new" : "booking_new",
      { emergencyType: b.emergencyType, distanceKm: target.distanceKm },
      { bookingId: b.id, kind: b.isSos ? "sos" : "booking" }, b.isSos ? "sos_alerts_v2" : "booking_alerts_v2");
    const [afterPush] = await db.select({ status: bookings.status, dispatchStartedAt: bookings.dispatchStartedAt }).from(bookings).where(eq(bookings.id, b.id));
    if (state.stopped || afterPush?.status !== "REQUESTED" || +afterPush.dispatchStartedAt !== +b.dispatchStartedAt) {
      await dismissPushToDriver(target.driverId, b.id);
      await emitToDriver(target.driverId, "sos:cancelled", { bookingId: b.id });
      stopCascade(b.id); return;
    }
  }
  schedule(app, state, "delay" in outcome ? outcome.delay! : WAVE_INTERVAL_MS);
}

export async function startCascade(app: FastifyInstance, bookingId: string): Promise<void> {
  if (starting.has(bookingId)) return starting.get(bookingId)!;
  if (runners.has(bookingId)) return;
  const pending = (async () => {
    const state: RunnerState = { bookingId, timer: null, stopped: false };
    runners.set(bookingId, state);
    try { await runWave(app, state); }
    catch (error) { app.log.error({ error, bookingId }, "Initial dispatch failed; retry scheduled"); schedule(app, state, WAVE_INTERVAL_MS); throw error; }
  })().finally(() => { starting.delete(bookingId); });
  starting.set(bookingId, pending);
  return pending;
}

export function stopCascade(bookingId: string): void {
  const state = runners.get(bookingId);
  if (!state) return;
  state.stopped = true;
  if (state.timer) clearTimeout(state.timer);
  runners.delete(bookingId);
}

export function noteCascadeReject(_bookingId: string, _driverId: string): void {
  // Rejections are read from the durable attempt rows before every offer.
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
    // v1.2.8: the socket emit above only dismisses the modal on a foregrounded
    // app — also fire a silent data-only dismiss so a backgrounded/killed
    // loser's tray notification for this dead SOS clears too.
    void dismissPushToDriver(row.driverId, bookingId);
  }
}

export async function resumeOnBoot(app: FastifyInstance): Promise<void> {
  const pending = await db.select({ id: bookings.id }).from(bookings)
    .where(and(eq(bookings.status, "REQUESTED"), drizzleSql`(${bookings.isSos} = true OR ${bookings.dispatchStartedAt} >= ${new Date(Date.now() - DISPATCH_WINDOW_MS).toISOString()})`));
  for (const b of pending) {
    try { await startCascade(app, b.id); }
    catch (error) { app.log.error({ error, bookingId: b.id }, "Dispatch resume failed"); }
  }
}

export async function offerPendingSosToDriver(app: FastifyInstance, _driverId: string): Promise<void> {
  // Availability can recover a missing runner, but cannot jump ahead of its persisted wave clock.
  await resumeOnBoot(app);
}
