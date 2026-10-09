import { useEffect, useState } from "react";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import { me, getToken, API_BASE } from "./api";

export type PushStatus = "checking" | "ready" | "denied" | "unavailable" | "error";
let status: PushStatus = "checking";
const listeners = new Set<(value: PushStatus) => void>();
const publish = (value: PushStatus) => { status = value; listeners.forEach(listener => listener(value)); };
export function usePushStatus() {
  const [value, setValue] = useState(status);
  useEffect(() => { listeners.add(setValue); return () => { listeners.delete(setValue); }; }, []);
  return value;
}
Notifications.setNotificationHandler({
  handleNotification: async notification => {
    const visible = notification.request.content.data?.type !== "dismiss";
    return { shouldShowAlert: visible, shouldPlaySound: visible, shouldSetBadge: false, shouldShowBanner: visible, shouldShowList: visible };
  }
});

const DISMISS_TASK = "jr-user-dismiss-notification";
function dismissBookingIdFrom(data: Record<string, unknown> | null | undefined): string | null {
  return data?.type === "dismiss" && typeof data.bookingId === "string" ? data.bookingId : null;
}
async function dismissForBooking(bookingId: string) {
  const presented = await Notifications.getPresentedNotificationsAsync();
  for (const notification of presented) {
    if (notification.request.content.data?.bookingId === bookingId || notification.request.identifier === bookingId) {
      try { await Notifications.dismissNotificationAsync(notification.request.identifier); }
      catch (error) { console.error("[push] could not dismiss stale ride notification", error); }
    }
  }
}
// Background tasks must be defined while the entry module loads, before any UI mounts.
TaskManager.defineTask(DISMISS_TASK, async ({ data, error }: { data?: any; error?: unknown }) => {
  if (error) { console.error("[push] background notification task failed", error); return; }
  const payload = data?.notification?.data ?? data?.notification?.request?.content?.data ?? data?.data;
  const bookingId = dismissBookingIdFrom(payload);
  if (bookingId) {
    try { await dismissForBooking(bookingId); }
    catch (cause) { console.error("[push] background dismiss failed", cause); }
  }
});
let registeredSession: string | null = null;
let registering: Promise<void> | null = null;
let received: Notifications.EventSubscription | null = null;
let tokenChanged: Notifications.EventSubscription | null = null;

let registrationGeneration = 0;
async function bounded<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Notification service timed out")), milliseconds); })]); }
  finally { if (timer) clearTimeout(timer); }
}

export async function revokePushSession(session: string | null): Promise<void> {
  registrationGeneration += 1;
  teardownPushDismissHandlers();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const results = await Promise.allSettled([
      session ? fetch(`${API_BASE}/api/v1/me/push-token`, { method: "DELETE", headers: { Authorization: `Bearer ${session}` }, signal: controller.signal }).then(response => { if (!response.ok && response.status !== 401) throw new Error(`Push revocation HTTP ${response.status}`); }) : Promise.resolve(),
      Device.isDevice ? bounded(Notifications.unregisterForNotificationsAsync(), 4000) : Promise.resolve(),
      bounded(Notifications.dismissAllNotificationsAsync(), 4000)
    ]);
    for (const result of results) if (result.status === "rejected") console.warn("[push] logout notification cleanup unavailable", result.reason);
    if (results[0].status === "rejected" && results[1].status === "rejected") throw new Error("Notification access could not be revoked while offline");
  } finally { clearTimeout(timer); }
}

export function registerPushToken(): Promise<void> {
  if (registering) return registering;
  const generation = registrationGeneration;
  registering = (async () => {
    try {
      const session = await getToken();
      if (!session) throw new Error("Push registration requires a session");
      if (!Device.isDevice) { publish("unavailable"); return; }
      const existing = await Notifications.getPermissionsAsync();
      const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
      if (!permission.granted) { registeredSession = null; publish("denied"); return; }
      if (registeredSession === session) { publish("ready"); return; }
      publish("checking");
      if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("default", {
        name: "Jeevan Rakshak alerts", importance: Notifications.AndroidImportance.HIGH, sound: "default"
      });
      const response = await bounded(Notifications.getDevicePushTokenAsync(), 15000);
      if (!response?.data) throw new Error("FCM did not return a device token");
      if (generation !== registrationGeneration || session !== await getToken()) throw new Error("Account changed during push registration");
      await me.registerPushToken(String(response.data));
      if (generation !== registrationGeneration || session !== await getToken()) throw new Error("Account changed while saving push registration");
      await Notifications.registerTaskAsync(DISMISS_TASK);
      if (!received) received = Notifications.addNotificationReceivedListener(notification => {
        const bookingId = dismissBookingIdFrom(notification.request.content.data);
        if (bookingId) void dismissForBooking(bookingId).catch(error => console.error("[push] foreground dismiss failed", error));
      });
      if (!tokenChanged) tokenChanged = Notifications.addPushTokenListener(() => {
        registeredSession = null;
        void registerPushToken().catch(error => console.error("[push] token refresh failed", error));
      });
      registeredSession = session;
      publish("ready");
    } catch (error) { publish("error"); console.error("[push] registration failed", error); throw error; }
  })().finally(() => { registering = null; });
  return registering;
}
export function teardownPushDismissHandlers() {
  received?.remove(); received = null; tokenChanged?.remove(); tokenChanged = null;
  registeredSession = null; publish("checking");
  // Keep the registered background task for system delivery after the UI exits.
}
