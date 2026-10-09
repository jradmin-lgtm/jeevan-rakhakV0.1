import { useEffect, useRef, useState } from "react";
import { fetchOsrmRoute } from "../maps/osrmRoute";
import { type CachedRoadRoute } from "../maps/rideCache";

type Booking = { id: string; status: string; pickupLat: number; pickupLng: number; dropLat?: number | null; dropLng?: number | null };
type Cache = {
  load(): Promise<{ booking: { id: string }; route?: CachedRoadRoute | null } | null>;
  saveRoute(id: string, route: CachedRoadRoute): Promise<void>;
};
type GoogleRoute = { available: boolean; durationMin?: number; distanceKm?: number; path?: [number, number][] };

export function useRideRoute(booking: Booking, position: { lat: number; lng: number; ts?: number } | null, provider: "google" | "osm", cache: Cache, googleRoute: (id: string) => Promise<GoogleRoute>) {
  const [path, setPath] = useState<Array<[number, number]> | null>(null);
  const [estimate, setEstimate] = useState<{ km: number; min: number } | null>(null);
  const [source, setSource] = useState("estimate");
  const [cacheError, setCacheError] = useState(false);
  const positionRef = useRef(position); positionRef.current = position;
  useEffect(() => {
    setPath(null); setEstimate(null); setSource("estimate");
    if (!["ACCEPTED", "ARRIVED", "PICKED_UP"].includes(booking.status)) return;
    const past = booking.status === "PICKED_UP";
    const to = { lat: past ? booking.dropLat ?? booking.pickupLat : booking.pickupLat, lng: past ? booking.dropLng ?? booking.pickupLng : booking.pickupLng };
    const destination = `${past ? "drop" : "pickup"}:${to.lat}:${to.lng}`;
    let active = true, running = false;
    let saved: CachedRoadRoute | null = null;
    let controller: AbortController | null = null;
    const showSaved = () => {
      if (!active || !saved) return;
      setPath(saved.coords); setEstimate({ km: saved.distanceKm, min: saved.durationMin }); setSource("cached");
    };
    const refresh = async () => {
      if (running || !active) return;
      const from = positionRef.current;
      if (!from || (from.ts != null && Date.now() - from.ts > 60_000)) { showSaved(); return; }
      running = true;
      controller = new AbortController();
      try {
        // Google route geometry is displayed only on its matching map renderer.
        // It is never written to the offline road cache.
        let liveTraffic = false;
        if (provider === "google") {
          try {
            const live = await googleRoute(booking.id);
            if (!active) return;
            if (live.available && live.path?.length && live.durationMin != null && live.distanceKm != null) {
              setPath(live.path); setEstimate({ km: live.distanceKm, min: live.durationMin }); setSource("traffic");
              liveTraffic = true;
              if (saved && Date.now() - saved.savedAt < 120_000) return;
            }
          } catch (error) { console.warn("[route] traffic route unavailable", error); }
        }
        const route = await fetchOsrmRoute(from, to, { signal: controller.signal });
        if (!active) return;
        if (route) {
          if (!liveTraffic) { setPath(route.coords); setEstimate({ km: route.distanceKm, min: route.durationMin }); setSource("road"); }
          saved = { ...route, provider: "osrm", destination, savedAt: Date.now() };
          try { await cache.saveRoute(booking.id, saved); if (active) setCacheError(false); }
          catch (error) { console.error("[route] offline route could not be saved", error); if (active) setCacheError(true); }
        } else if (!liveTraffic && saved) { showSaved(); }
        else if (!liveTraffic) { setPath(null); setEstimate(null); setSource("estimate"); }
      } finally { running = false; }
    };
    void (async () => {
      try {
        const snapshot = await cache.load();
        if (!active) return;
        if (snapshot?.booking.id === booking.id && snapshot.route?.destination === destination && snapshot.route.provider === "osrm") { saved = snapshot.route; showSaved(); }
      } catch (error) { console.error("[route] offline route could not be restored", error); if (active) setCacheError(true); }
      await refresh();
    })();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => { active = false; clearInterval(timer); controller?.abort(); };
  }, [booking.id, booking.status, booking.pickupLat, booking.pickupLng, booking.dropLat, booking.dropLng, !!position, provider, cache, googleRoute]);
  return { path, estimate, source, cacheError };
}
