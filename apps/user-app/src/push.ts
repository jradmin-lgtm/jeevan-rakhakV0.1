/**
 * v1.1.0 — push-notification registration (patient app).
 *
 * Asks for notification permission, gets the device's **FCM** token
 * (getDevicePushTokenAsync returns the native FCM token on Android), and
 * registers it with the backend so the server can send status updates
 * ("Ambulance assigned", "Driver arrived", "On the way to hospital",
 * "Trip complete") even when the app is backgrounded or killed.
 *
 * Best-effort: every failure is swallowed so push setup can never block the
 * app. No-ops on a simulator/emulator (no FCM) and if the OS denies
 * permission. Safe to call repeatedly (idempotent server-side upsert).
 *
 * v1.2.8 · silent dismiss-on-death. When a booking dies (cancelled, no driver,
 * re-dispatched, expired) the server sends a DATA-ONLY message:
 *   { type: "dismiss", bookingId: "<uuid>" }
 * We never want to *show* that as a banner; we want it to silently pull the
 * stale status notification out of the tray. We handle it on two paths:
 *   - foreground: an addNotificationReceivedListener fires while the app is open;
 *   - background/killed: a registered notification task (expo-task-manager).
 * Both funnel into dismissForBooking(), which matches presented notifications by
 * data.bookingId OR by Android tag (the presented request identifier) and
 * dismisses only those. We never dismiss-all.
 */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { me } from "./api";

// Show foreground notifications too (not just background) so a patient who's
// staring at the map still gets the banner + sound on a status change.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

let _registered = false;

export async function registerPushToken(): Promise<void> {
  if (_registered) return;
  try {
    if (!Device.isDevice) return; // emulators have no FCM
    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync();
      granted = req.granted;
    }
    if (!granted) return;
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Jeevan Rakshak alerts",
        importance: Notifications.AndroidImportance.HIGH,
        sound: "default"
      });
    }
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = tokenResp?.data ? String(tokenResp.data) : null;
    if (!token) return;
    await me.registerPushToken(token);
    _registered = true;
    // v1.2.8: wire the silent dismiss handlers once we're permitted + registered.
    setupDismissHandlers();
  } catch {
    /* best-effort — never block app start */
  }
}

// ---------------------------------------------------------------------------
// v1.2.8: silent dismiss-on-death
// ---------------------------------------------------------------------------

const DISMISS_TASK = "jr-user-dismiss-notification";

// Pull the dismiss bookingId out of an arbitrary notification data payload.
// FCM data values arrive as strings; we only act on type === "dismiss".
function dismissBookingIdFrom(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  if (String(data.type) !== "dismiss") return null;
  const id = data.bookingId;
  return id != null && String(id).length > 0 ? String(id) : null;
}

// Remove the tray notification(s) for exactly this booking. Matches a presented
// notification when its data.bookingId equals bookingId OR (Android) its request
// identifier (= the FCM tag) equals bookingId. Never dismiss-all.
async function dismissForBooking(bookingId: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const n of presented) {
      const data = (n.request?.content?.data ?? null) as Record<string, unknown> | null;
      const dataBookingId = data?.bookingId != null ? String(data.bookingId) : null;
      const tag = n.request?.identifier ?? null; // Android: the notification tag
      if (dataBookingId === bookingId || tag === bookingId) {
        try {
          await Notifications.dismissNotificationAsync(n.request.identifier);
        } catch {
          /* one stale entry failing to clear shouldn't block the rest */
        }
      }
    }
  } catch {
    /* best-effort — never throw out of a notification callback */
  }
}

let _receivedSub: Notifications.EventSubscription | null = null;
let _taskRegistered = false;

function setupDismissHandlers(): void {
  // Foreground path: fires for every notification received while the app is
  // open. A dismiss message has no visible content; we just clear the matching
  // tray entry and return.
  if (!_receivedSub) {
    _receivedSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = (notification.request?.content?.data ?? null) as Record<string, unknown> | null;
      const bookingId = dismissBookingIdFrom(data);
      if (bookingId) void dismissForBooking(bookingId);
    });
  }

  // Background/killed path: a notification task runs even when no JS UI is
  // mounted. This requires expo-task-manager (a peer of expo-notifications); if
  // it isn't installed in this build we silently skip it and rely on the
  // foreground path. Guarded require keeps typecheck + runtime safe either way.
  if (!_taskRegistered) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const TaskManager = require("expo-task-manager");
      if (TaskManager && typeof TaskManager.defineTask === "function") {
        TaskManager.defineTask(DISMISS_TASK, ({ data, error }: { data?: any; error?: unknown }) => {
          if (error || !data) return;
          // The notification payload location varies by platform; probe both.
          const payload =
            data?.notification?.data ??
            data?.notification?.request?.content?.data ??
            data?.data ??
            null;
          const bookingId = dismissBookingIdFrom(payload as Record<string, unknown> | null);
          if (bookingId) void dismissForBooking(bookingId);
        });
        void Notifications.registerTaskAsync(DISMISS_TASK);
        _taskRegistered = true;
      }
    } catch {
      /* expo-task-manager not present — foreground listener still covers the open-app case */
    }
  }
}

// Teardown for the added foreground listener + background task. Call on unmount
// of the owning component so we don't leak a subscription across reloads.
export function teardownPushDismissHandlers(): void {
  if (_receivedSub) {
    Notifications.removeNotificationSubscription(_receivedSub);
    _receivedSub = null;
  }
  if (_taskRegistered) {
    void Notifications.unregisterTaskAsync(DISMISS_TASK).catch(() => {
      /* best-effort */
    });
    _taskRegistered = false;
  }
}
