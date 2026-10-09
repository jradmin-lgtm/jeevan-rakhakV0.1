import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { driver as driverApi } from "../api";

export function useDriverHeartbeat(online: boolean) {
  const [error, setError] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    const tick = async () => {
      if (!online || AppState.currentState !== "active" || busy.current) return;
      busy.current = true;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) throw new Error("Location permission is required for dispatch");
        const cached = await Location.getLastKnownPositionAsync({ maxAge: 30_000, requiredAccuracy: 200 });
        const fix = cached ?? await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Dispatch location timed out")), 15_000); })
        ]);
        if (!active) return;
        if (Date.now() - fix.timestamp > 60_000) throw new Error("Dispatch location is stale");
        await driverApi.heartbeat(fix.coords.latitude, fix.coords.longitude, fix.timestamp);
        if (active) setError(false);
      } catch (cause) {
        console.warn("[dispatch] heartbeat failed", cause);
        if (active) setError(true);
      } finally { if (timeout) clearTimeout(timeout); busy.current = false; }
    };
    if (!online) setError(false);
    void tick();
    const timer = setInterval(() => void tick(), 60_000);
    const sub = AppState.addEventListener("change", state => { if (state === "active") void tick(); });
    return () => { active = false; clearInterval(timer); sub.remove(); };
  }, [online]);
  return error;
}
