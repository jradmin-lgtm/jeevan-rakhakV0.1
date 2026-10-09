/**
 * v1.1.0 (CR#3/#6) — free road-route + ETA via the public OSRM demo server.
 *
 * No API key, ₹0. Returns the route geometry as [lat, lng] pairs (OSRM emits
 * GeoJSON [lng, lat] — we flip), plus road distance + driving duration. Pass
 * the result to <MapEmbed routePath={...} /> to draw the real road line and
 * use distanceKm/durationMin for a road-based ETA instead of straight-line
 * haversine.
 *
 * Best-effort: any failure (network, abort, demo-server throttle) returns
 * null so the caller transparently falls back to the existing haversine ETA.
 * The demo server has no SLA — fine for the pilot; self-host before scale.
 */
export type OsrmRoute = {
  /** Ordered route geometry as [lat, lng] pairs. */
  coords: Array<[number, number]>;
  /** Road distance in km. */
  distanceKm: number;
  /** Driving duration in minutes (OSRM's estimate; no live traffic). */
  durationMin: number;
};

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export async function fetchOsrmRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts?: { signal?: AbortSignal }
): Promise<OsrmRoute | null> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  opts?.signal?.addEventListener("abort", abort);
  if (opts?.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 8000);
  try {
    const url =
      `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Road route HTTP ${res.status}`);
    const data: any = await res.json();
    const route = data?.routes?.[0];
    const line = route?.geometry?.coordinates;
    if (!Array.isArray(line) || line.length < 2 || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance < 0 || route.duration < 0) throw new Error("Road route response is incomplete");
    if (line.some((point: unknown) => !Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)) throw new Error("Road route contains invalid coordinates");
    const coords = line.map(
      (c: [number, number]) => [c[1], c[0]] as [number, number]
    );
    return {
      coords,
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60
    };
  } catch (error) {
    console.warn("Road route unavailable", error);
    return null;
  } finally {
    clearTimeout(timeout); opts?.signal?.removeEventListener("abort", abort);
  }
}
