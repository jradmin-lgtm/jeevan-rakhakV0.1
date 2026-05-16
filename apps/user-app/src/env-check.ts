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
    // NEVER throw at module load — that crashes the entire app before any
    // React boundary can catch it. Surface as a console warning instead;
    // any actual API call will fail cleanly with a UI-visible error.
    // eslint-disable-next-line no-console
    console.warn(
      "[env-check] Release build appears to have a missing/bad API base URL. " +
      "API_BASE=" + API_BASE + " SOCKET_BASE=" + SOCKET_BASE
    );
  }
}
