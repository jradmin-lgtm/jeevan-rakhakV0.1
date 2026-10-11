import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createClickTracker } from "@jr/ui";
import { api, getCachedProfile, getToken } from "./api";
export const clicks = createClickTracker(AsyncStorage, async () => await getToken() ? (await getCachedProfile())?.id ?? null : null,
  events => api("/api/v1/ui-events", { method: "POST", body: { events } }));
export function startClickSync() {
  const flush = () => { if (AppState.currentState === "active") void clicks.flush().catch(error => console.warn("[click-tracking] retry pending", error)); };
  flush();
  const subscription = AppState.addEventListener("change", state => { if (state === "active") flush(); });
  const timer = setInterval(flush, 30_000);
  return () => { subscription.remove(); clearInterval(timer); };
}
