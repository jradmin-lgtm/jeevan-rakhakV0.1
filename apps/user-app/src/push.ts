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
  } catch {
    /* best-effort — never block app start */
  }
}
