import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, getCachedProfile } from "./api";

const KEY = "jr.driver.location-queue";
const MAX_POINTS = 4800;
export type QueuedLocation = { bookingId: string; lat: number; lng: number; ts: number; speedKmh?: number; headingDeg?: number };
type Queue = { owner: string; points: QueuedLocation[] };
let serial: Promise<unknown> = Promise.resolve();
let flushing: Promise<void> | null = null;
let lastError: string | null = null;
let expiredCount = 0;

function locked<T>(operation: () => Promise<T>): Promise<T> {
  const next = serial.then(operation);
  serial = next.catch(error => { lastError = error instanceof Error ? error.message : "Offline location storage failed"; console.error("[gps-queue] storage operation failed", error); });
  return next;
}
async function readQueue(): Promise<Queue> {
  const profile = await getCachedProfile();
  if (!profile?.id) throw new Error("Driver profile unavailable for location storage");
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return { owner: profile.id, points: [] };
  const queue = JSON.parse(raw) as Queue;
  if (queue.owner !== profile.id || !Array.isArray(queue.points)) throw new Error("Location queue does not belong to this driver");
  return queue;
}
export async function queueLocation(point: QueuedLocation): Promise<void> {
  await locked(async () => {
    const queue = await readQueue();
    if (queue.points.some(p => p.bookingId === point.bookingId && p.ts === point.ts)) return;
    if (queue.points.length >= MAX_POINTS) { lastError = "Offline location storage is full. Reconnect to sync your route."; throw new Error(lastError); }
    queue.points.push(point);
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  });
}
export async function locationQueueStatus() {
  return locked(async () => ({ pending: (await readQueue()).points.length, error: lastError, expired: expiredCount }));
}
export function flushLocationQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      for (let wave = 0; wave < 48; wave += 1) {
        const batch = await locked(async () => { const queue = await readQueue(); return { owner: queue.owner, points: queue.points.slice(0, 100) }; });
        if (!batch.points.length) { lastError = null; return; }
        const response = await api<{ ok: boolean; accepted: number; expired: number }>("/api/v1/driver/location-batch", { method: "POST", body: { points: batch.points } });
        if (!response.ok || !Number.isInteger(response.accepted) || !Number.isInteger(response.expired) || response.accepted < 0 || response.expired < 0 || response.accepted + response.expired !== batch.points.length) throw new Error("Server did not acknowledge the complete location batch");
        const sent = new Set(batch.points.map(p => `${p.bookingId}:${p.ts}`));
        await locked(async () => {
          const queue = await readQueue();
          if (queue.owner !== batch.owner) throw new Error("Driver changed during location sync");
          queue.points = queue.points.filter(p => !sent.has(`${p.bookingId}:${p.ts}`));
          await AsyncStorage.setItem(KEY, JSON.stringify(queue));
        });
        expiredCount += response.expired;
        lastError = null;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Location sync failed";
      throw error;
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
