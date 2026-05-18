import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { driver as driverApi } from "../api";

/**
 * v1.0.15 — "I'm online" heartbeat for the SOS cascade engine.
 *
 * While the driver is online AND the app is foregrounded, ping
 * POST /api/v1/driver/heartbeat every 60s with the current GPS. The server
 * upserts into the `driver_heartbeats` table, which the cascade engine reads
 * (with a 5-min staleness window) to pick the nearest available drivers when
 * a patient hits SOS.
 *
 * Battery: pauses when backgrounded; resumes when foregrounded. Stops cleanly
 * when the driver toggles offline.
 *
 * Permissions: re-uses whatever foreground-location permission the app
 * already asked for during onboarding / trip GPS. No additional prompts.
 */
export function useDriverHeartbeat(online: boolean) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    const start = () => {
      if (timerRef.current) return;
      const tick = async () => {
        // Re-check AppState every tick — covers the race where AppState
        // changes between subscription dispatch and the timer firing.
        if (appStateRef.current !== "active") return;
        try {
          const perm = await Location.getForegroundPermissionsAsync();
          if (perm.status !== "granted") return;
          const fix = await Location.getLastKnownPositionAsync()
            ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (!fix) return;
          await driverApi.heartbeat(fix.coords.latitude, fix.coords.longitude);
        } catch {
          // Heartbeat is best-effort. A missed beat is fine — the server's
          // 5-min staleness window tolerates short outages.
        }
      };
      // Immediate first tick (don't wait 60s for the first ping after
      // toggling online — the server needs to see us in the eligible list).
      void tick();
      timerRef.current = setInterval(tick, 60_000);
    };
    const stop = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    if (online && appStateRef.current === "active") {
      start();
    }

    const sub = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
      if (next === "active" && online) {
        start();
      } else {
        stop();
      }
    });

    return () => {
      sub.remove();
      stop();
    };
  }, [online]);
}
