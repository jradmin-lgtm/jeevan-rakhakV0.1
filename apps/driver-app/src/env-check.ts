import { API_BASE, SOCKET_BASE } from "./api";

declare const __DEV__: boolean;

function isBadProductionBase(url: string): boolean {
  const u = (url || "").trim().toLowerCase();
  if (!u) return true;
  if (u.includes("localhost") || u.includes("127.0.0.1")) return true;
  if (u.includes("replace") || u.includes("changeme") || u.includes("configure")) return true;
  return false;
}

if (!__DEV__) {
  if (isBadProductionBase(API_BASE) || isBadProductionBase(SOCKET_BASE)) {
    throw new Error(
      "Release build: set EXPO_PUBLIC_API_BASE_URL and EXPO_PUBLIC_SOCKET_BASE_URL (see .env.production)."
    );
  }
}
