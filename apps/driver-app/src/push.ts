/**
 * v1.1.0 — push-notification registration (driver app).
 *
 * Same as the patient app: asks permission, gets the FCM device token, and
 * registers it so the server can wake the driver for a new SOS/booking even
 * when the app is backgrounded or killed (the socket/poll only reach a
 * foregrounded app). Best-effort; no-ops on emulator / denied permission.
 */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { me } from "./api";

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
    if (!Device.isDevice) return;
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
    /* best-effort */
  }
}
