/**
 * Hospital-portal ETA/distance helpers (CR#3, v1.2.0).
 *
 * admin-web does not depend on @jr/utils or @jr/ui, so these mirror the
 * existing helpers (packages/utils haversineDistanceKm + packages/ui
 * fetchOsrmRoute) self-contained, with no new dependency. OSRM gives the
 * real road route + driving ETA; on any failure we transparently fall back
 * to the straight-line haversine estimate.
 */

export type Coord = { lat: number; lng: number };

export function haversineKm(a: Coord, b: Coord): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Rough straight-line ETA: ~28 km/h effective urban ambulance speed. */
export function haversineEtaMin(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / 28) * 60));
}

export type RouteResult = {
  coords: Array<[number, number]>;
  distanceKm: number;
  durationMin: number;
};

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";

export async function fetchOsrmRoute(
  from: Coord,
  to: Coord,
  opts?: { signal?: AbortSignal }
): Promise<RouteResult | null> {
  try {
    const url =
      `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}` + `?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) return null;
    const data: any = await res.json();
    const route = data?.routes?.[0];
    const line = route?.geometry?.coordinates;
    if (!Array.isArray(line) || line.length < 2) return null;
    const coords = line.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
    return {
      coords,
      distanceKm: Number(route.distance ?? 0) / 1000,
      durationMin: Number(route.duration ?? 0) / 60
    };
  } catch {
    return null;
  }
}

export function fmtDistance(km: number | null | undefined): string {
  if (km == null || !isFinite(km)) return "-";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function fmtEta(min: number | null | undefined): string {
  if (min == null || !isFinite(min)) return "-";
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
