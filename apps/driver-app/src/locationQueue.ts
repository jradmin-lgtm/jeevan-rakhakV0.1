import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, getCachedProfile } from "./api";

const KEY = "jr.driver.location-queue";
const MAX_POINTS = 4800;
export type QueuedLocation = { bookingId: string; lat: number; lng: number; ts: number; speedKmh?: number; headingDeg?: number };
type Queue = { owner: string; points: QueuedLocation[] };
let serial: Promise<unknown> = Promise.resolve();
let flushing: Promise<void> | null = null;
let lastError: string | null = null;
const pointKey = (p: { bookingId: string; ts: number }) => `${p.bookingId}:${p.ts}`;
let expiredCount = 0;

function locked<T>(operation: () => Promise<T>): Promise<T> {
  const next = serial.then(operation);
  serial = next.catch(error => { lastError = error instanceof Error ? error.message : "Offline location storage failed"; console.error("[gps-queue] storage operation failed", error); });
  return next;
}
async function readQueue(): Promise<Queue> {
  const profile = await getCachedProfile();
  if (!profile?.id) throw new Error("Driver profile unavailable for location storage");
  const raw = await AsyncStorage.getItem(`${KEY}.${profile.id}`);
  if (raw) {
    const queue = JSON.parse(raw) as Queue;
    if (queue.owner !== profile.id || !Array.isArray(queue.points)) throw new Error("Location storage is invalid. Contact support before clearing app data.");
    return queue;
  }
  // Upgrade the legacy queue only for its owner. Other accounts cannot read or send it.
  const legacy = await AsyncStorage.getItem(KEY);
  if (legacy) {
    const queue = JSON.parse(legacy) as Queue;
    if (!Array.isArray(queue.points)) throw new Error("Legacy location storage is invalid");
    if (queue.owner === profile.id) {
      await AsyncStorage.setItem(`${KEY}.${profile.id}`, JSON.stringify(queue));
      await AsyncStorage.removeItem(KEY);
      return queue;
    }
  }
  return { owner: profile.id, points: [] };
}

export async function queueLocation(point: QueuedLocation): Promise<void> {
  await locked(async () => {
    const queue = await readQueue();
    if (queue.points.some(p => p.bookingId === point.bookingId && p.ts === point.ts)) return;
    if (queue.points.length >= MAX_POINTS) { lastError = "Offline location storage is full. Reconnect to sync your route."; throw new Error(lastError); }
    queue.points.push(point);
    await AsyncStorage.setItem(`${KEY}.${queue.owner}`, JSON.stringify(queue));
  });
}
export async function locationQueueStatus() {
  return locked(async () => ({ pending: (await readQueue()).points.length, error: lastError, expired: expiredCount }));
}
export function flushLocationQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      const blocked = new Set<string>();
      const blockedPoints = new Set<string>();
      let rejectedBatch: Error | null = null;
      for (let wave = 0; wave < 48; wave += 1) {
        const batch = await locked(async () => { const queue = await readQueue(); const first = queue.points.find(p => !blocked.has(p.bookingId) && !blockedPoints.has(pointKey(p))); return { owner: queue.owner, points: first ? queue.points.filter(p => p.bookingId === first.bookingId && !blockedPoints.has(pointKey(p))).slice(0, 100) : [] }; });
        if (!batch.points.length) { if (rejectedBatch) throw rejectedBatch; lastError = null; return; }
        let response: { ok: boolean; accepted: number; expired: number; acknowledged?: Array<{ bookingId: string; ts: number }>; rejected?: Array<{ bookingId: string; ts: number; reason: string }> };
        try {
          response = await api<typeof response>("/api/v1/driver/location-batch", { method: "POST", body: { points: batch.points, partial: true } });
        } catch (error) {
          if ([400, 403].includes((error as { status?: number }).status ?? 0)) {
            blocked.add(batch.points[0].bookingId);
            rejectedBatch = error instanceof Error ? error : new Error("Location batch rejected");
            continue;
          }
          throw error;
        }
        let sent: Set<string>;
        if (Object.prototype.hasOwnProperty.call(response, "acknowledged") || Object.prototype.hasOwnProperty.call(response, "rejected")) {
          if (!Array.isArray(response.acknowledged) || !Array.isArray(response.rejected)) throw new Error("Server returned a malformed partial location acknowledgement");
          const validPoint = (p: unknown): p is { bookingId: string; ts: number } => !!p && typeof p === "object" && typeof (p as { bookingId?: unknown }).bookingId === "string" && Number.isFinite((p as { ts?: number }).ts);
          if (!response.acknowledged.every(validPoint) || !response.rejected.every(p => validPoint(p) && typeof p.reason === "string")) throw new Error("Server returned a malformed partial location acknowledgement");
          const expected = new Set(batch.points.map(pointKey));
          sent = new Set(response.acknowledged.map(pointKey));
          const rejected = new Set(response.rejected.map(pointKey));
          if (!response.ok || sent.size !== response.acknowledged.length || rejected.size !== response.rejected.length || sent.size !== response.accepted || response.expired !== 0 || sent.size + rejected.size !== expected.size || [...sent, ...rejected].some(k => !expected.has(k)) || [...sent].some(k => rejected.has(k))) throw new Error("Server did not acknowledge the complete location batch");
          for (const key of rejected) blockedPoints.add(key);
          if (rejected.size) rejectedBatch = new Error(response.rejected.map(p => p.reason).includes("future_location_fix") ? "future_location_fix: check automatic phone date and time" : "not_assigned_to_booking: saved points need support review");
        } else {
        if (!response.ok || !Number.isInteger(response.accepted) || !Number.isInteger(response.expired) || response.accepted < 0 || response.expired < 0 || response.accepted + response.expired !== batch.points.length) throw new Error("Server did not acknowledge the complete location batch");
        sent = new Set(batch.points.map(pointKey));
        }
        await locked(async () => {
          const queue = await readQueue();
          if (queue.owner !== batch.owner) throw new Error("Driver changed during location sync");
          queue.points = queue.points.filter(p => !sent.has(`${p.bookingId}:${p.ts}`));
          await AsyncStorage.setItem(`${KEY}.${queue.owner}`, JSON.stringify(queue));
        });
        expiredCount += response.expired;
        lastError = rejectedBatch?.message ?? null;
      }
      if (rejectedBatch) throw rejectedBatch;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Location sync failed";
      throw error;
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
