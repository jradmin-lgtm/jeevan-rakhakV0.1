import { NativeModules, Platform } from "react-native";
import { API_BASE, getToken, api } from "./api";

type AlertBridge = { configure(token:string,api:string):Promise<void>; startRequest(id:string,sos:boolean):Promise<void>; stopRequest(id:string):Promise<void>; stopRequests():Promise<void>; clearRequests():Promise<void> };
const native = NativeModules.JRPriorityAlerts as AlertBridge | undefined;
export const continuousAlertsSupported = Platform.OS === "android" && typeof native?.startRequest === "function";
export async function configureIncomingAlerts() {
  if (Platform.OS !== "android") return;
  if (!continuousAlertsSupported) throw new Error("Continuous alert module missing from this build");
  const token=await getToken();if(!token)throw new Error("Sign in to enable incoming request sounds");
  await native!.configure(token,API_BASE);
}
export async function startIncomingAlert(id:string,sos:boolean) {
  if (Platform.OS !== "android") return;
  const verifiedSession = await getToken();
  await configureIncomingAlerts();
  const current = await api<{ requests: Array<{ id: string }> }>("/api/v1/driver/incoming");
  if (!verifiedSession || verifiedSession !== await getToken()) throw new Error("Driver session changed during request verification");
  if (!Array.isArray(current.requests)) throw new Error("Incoming request verification unavailable");
  if (!current.requests.some(request => request.id === id)) return;
  await native!.startRequest(id,sos);
}
export async function stopIncomingAlert(id:string) {
  if (continuousAlertsSupported) await native!.stopRequest(id);
}
export async function revokeIncomingAlertSession() {
  if (continuousAlertsSupported) await native!.clearRequests();
}
export async function clearIncomingAlerts() {
  if (continuousAlertsSupported) await native!.stopRequests();
}
