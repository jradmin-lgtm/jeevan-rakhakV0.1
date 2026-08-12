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
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { getSocket } from "./socket";
import { driver as driverApi } from "./api";

export const LOCATION_TASK_NAME = "jr-driver-background-location";

// Bridges the currently-active trip's bookingId into this standalone task —
// TripScreen sets this on mount/unmount; the task has no React context of
// its own to read it from otherwise.
let activeBookingId: string | null = null;
// Persist to the DB every 3rd fix (~15s at the 5s update interval below),
// matching the previous foreground-only cadence — every fix still goes out
// over the socket for the live map, just not every fix needs a DB write.
let tickCount = 0;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: { data?: any; error?: unknown }) => {
  if (error || !data) return;
  const locations = data.locations as Array<{ coords: { latitude: number; longitude: number; speed?: number | null; heading?: number | null } }> | undefined;
  if (!locations || locations.length === 0) return;
  const fix = locations[locations.length - 1]; // most recent, in case several queued up
  const bookingId = activeBookingId;
  if (!bookingId) return; // no active trip — drop the fix, don't guess a target

  const lat = fix.coords.latitude;
  const lng = fix.coords.longitude;
  const speedKmh = fix.coords.speed != null && fix.coords.speed >= 0 ? fix.coords.speed * 3.6 : undefined;
  const headingDeg = fix.coords.heading != null && fix.coords.heading >= 0 ? fix.coords.heading : undefined;

  try {
    const sock = await getSocket();
    sock.emit("driver:location", { bookingId, lat, lng, speedKmh, headingDeg, ts: Date.now() });
  } catch {
    /* socket unavailable this tick — the 15s API persistence below is the fallback */
  }

  tickCount += 1;
  if (tickCount % 3 === 0) {
    try {
      await driverApi.pushLocation(lat, lng, bookingId, speedKmh, headingDeg);
    } catch {
      /* best-effort — next persisted tick will catch up */
    }
  }
});

/**
 * Start background tracking for a trip. Requests background location
 * permission if not already granted (must follow foreground permission —
 * requesting both at once is rejected on Android 10+). No-ops safely if
 * permission is denied; the map just won't update while backgrounded, same
 * as before this feature existed — never crashes the trip flow over a
 * permission the driver declined.
 */
export async function startBackgroundLocationTracking(bookingId: string): Promise<void> {
  activeBookingId = bookingId;
  tickCount = 0;
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted) return; // foreground must already be granted (TripScreen requests it separately)
    const bg = await Location.getBackgroundPermissionsAsync();
    if (!bg.granted) {
      const req = await Location.requestBackgroundPermissionsAsync();
      if (!req.granted) return;
    }
    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
    if (already) return;
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Jeevan Rakshak · Trip in progress",
        notificationBody: "Sharing your live location so the patient can track the ambulance.",
        notificationColor: "#E5322B"
      }
    });
  } catch {
    /* best-effort — a permission/OS refusal here must never block starting the trip */
  }
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  activeBookingId = null;
  try {
    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
    if (already) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    /* best-effort */
  }
}
