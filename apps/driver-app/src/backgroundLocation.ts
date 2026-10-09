/**
 * backgroundLocation.ts — keep pushing the driver's GPS location during an
 * active trip even when the app is backgrounded or the screen is off.
 *
 * 2026-08-12: TripScreen's old approach was a `setInterval` calling
 * `Location.getCurrentPositionAsync()` every 5s. That only ever ran while the
 * screen was mounted and the app foregrounded — the instant a driver locked
 * their phone or switched apps mid-trip (near-certain on a real 15-40 minute
 * ambulance ride), it stopped dead: no socket push, no API persistence, until
 * they came back. Real trial data showed exactly this — multi-minute gaps in
 * `driver_locations` correlating with normal phone use, not a broken feature.
 *
 * Fix: use expo-location's dedicated background-location API instead of a
 * foreground-only JS interval. `startLocationUpdatesAsync` with a
 * `foregroundService` config starts a real Android foreground service (a
 * persistent, visible notification — Android requires this for continuous
 * background location access), which keeps this app's JS process alive and
 * lets location fixes keep arriving via the registered TaskManager task
 * below, regardless of foreground/background state.
 *
 * The task runs in the SAME JS engine (not a separate headless context, that
 * distinction only matters on iOS) — it can call the app's normal
 * getSocket()/API helpers directly, same as any other module.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getSocket } from "./socket";
import { queueLocation, flushLocationQueue } from "./locationQueue";

export const LOCATION_TASK_NAME = "jr-driver-background-location";

// Bridges the currently-active trip's bookingId into this standalone task —
// TripScreen sets this on mount/unmount; the task has no React context of
// its own to read it from otherwise.
let activeBookingId: string | null = null;
// Persist to the DB every 3rd fix (~15s at the 5s update interval below),
// matching the previous foreground-only cadence — every fix still goes out
// over the socket for the live map, just not every fix needs a DB write.
let tickCount = 0;
let lastFixAt = 0;
export async function publishTripFix(bookingId: string, fix: { coords: { latitude: number; longitude: number; speed?: number | null; heading?: number | null; accuracy?: number | null }; timestamp: number }) {
  if (!Number.isFinite(fix.timestamp) || fix.timestamp <= lastFixAt || fix.timestamp > Date.now() + 10_000 || Date.now() - fix.timestamp > 24 * 60 * 60_000 || (fix.coords.accuracy != null && fix.coords.accuracy > 100)) return;
  const lat = fix.coords.latitude, lng = fix.coords.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("GPS coordinates are out of range");
  lastFixAt = fix.timestamp;
  const speedKmh = fix.coords.speed != null && fix.coords.speed >= 0 && fix.coords.speed <= 300 / 3.6 ? fix.coords.speed * 3.6 : undefined;
  const headingDeg = fix.coords.heading != null && fix.coords.heading >= 0 && fix.coords.heading <= 360 ? fix.coords.heading : undefined;
  tickCount += 1;
  if (tickCount === 1 || tickCount % 3 === 0) {
    await queueLocation({ bookingId, lat, lng, speedKmh, headingDeg, ts: fix.timestamp });
    void flushLocationQueue().catch(error => console.error("[gps] location saved for reconnect", error));
  }
  try {
    const sock = await getSocket();
    if (sock.connected && Date.now() - fix.timestamp <= 60_000) sock.volatile.emit("driver:location", { bookingId, lat, lng, speedKmh, headingDeg, ts: fix.timestamp });
  } catch (error) { console.error("[gps] realtime unavailable; sampled fixes are saved in the queue", error); }

}


TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: { data?: any; error?: unknown }) => {
  if (error) { console.error("[gps] background task failed", error); return; }
  if (!data?.locations?.length) return;
  try {
    const bookingId = await AsyncStorage.getItem("jr_active_tracking_booking");
    if (!bookingId) return;
    const ordered = [...data.locations].sort((a, b) => a.timestamp - b.timestamp);
    for (const fix of ordered) await publishTripFix(bookingId, fix);
  }
  catch (err) { console.error("[gps] location delivery failed", err); }
});

/**
 * Start background tracking for a trip. Requests background location
 * permission if not already granted (must follow foreground permission —
 * requesting both at once is rejected on Android 10+). No-ops safely if
 * permission is denied; the map just won't update while backgrounded, same
 * as before this feature existed — never crashes the trip flow over a
 * permission the driver declined.
 */
export async function startBackgroundLocationTracking(bookingId: string): Promise<boolean> {
  activeBookingId = bookingId;
  lastFixAt = 0;
  tickCount = 0;
  try {
    await AsyncStorage.setItem("jr_active_tracking_booking", bookingId);
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) throw new Error("foreground_location_permission_required"); // foreground must already be granted (TripScreen requests it separately)
    const bg = await Location.getBackgroundPermissionsAsync();
    if (!bg.granted) {
      const req = await Location.requestBackgroundPermissionsAsync();
      if (!req.granted) return false;
    }
    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (already) return true;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Jeevan Rakshak · Trip in progress",
        notificationBody: "Sharing your live location so the patient can track the ambulance.",
        notificationColor: "#E5322B"
      }
    });
    return true;
  } catch (err) {
    console.error("[gps] background tracking unavailable", err);
    return false;
    /* best-effort — a permission/OS refusal here must never block starting the trip */
  }
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  activeBookingId = null;
  try {
    await AsyncStorage.removeItem("jr_active_tracking_booking");
    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (already) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (error) { console.error("[gps] could not stop background tracking", error); throw error; }
}
