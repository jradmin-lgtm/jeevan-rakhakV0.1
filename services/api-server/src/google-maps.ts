/**
 * Google Maps live-routing helpers (2026-08-17 exploration).
 *
 * Gated by FLAG_GOOGLE_DISPATCH_ENABLED / FLAG_GOOGLE_ETA_ENABLED (both
 * default off in @jr/config) — until a flag is flipped on Render, nothing
 * here is called. Every exported function is best-effort: a missing key,
 * network error, timeout, or non-OK API status returns null so callers fall
 * back to their existing haversine-based logic. Dispatch and fare-quote must
 * never hard-depend on a third-party API being reachable.
 */
import { config } from "@jr/config";

const FETCH_TIMEOUT_MS = 4000;

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    console.warn("[google-maps] request failed", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type RoadDistance = { distanceKm: number; durationMin: number };

type DistanceMatrixResponse = {
  status: string;
  rows?: {
    elements: {
      status: string;
      distance?: { value: number };
      duration?: { value: number };
      duration_in_traffic?: { value: number };
    }[];
  }[];
};

/**
 * Ranks each candidate by real driving time to (destLat, destLng) via one
 * batched Distance Matrix call (all origins in a single request/element set).
 * Returns null WHOLESALE on any failure, missing key, or partial result —
 * a mix of real-road-ranked and haversine-ranked drivers in the same cascade
 * is worse than falling back to haversine for everyone.
 */
export async function getRoadDistances(
  candidates: { id: string; lat: number; lng: number }[],
  destLat: number,
  destLng: number
): Promise<Map<string, RoadDistance> | null> {
  const apiKey = config.maps.google.apiKey;
  if (!apiKey || candidates.length === 0) return null;

  const origins = candidates.map((c) => `${c.lat},${c.lng}`).join("|");
  const url =
    "https://maps.googleapis.com/maps/api/distancematrix/json" +
    `?origins=${encodeURIComponent(origins)}` +
    `&destinations=${destLat},${destLng}` +
    "&mode=driving&departure_time=now" +
    `&key=${apiKey}`;

  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;

  let json: DistanceMatrixResponse;
  try {
    json = (await res.json()) as DistanceMatrixResponse;
  } catch (err) {
    console.warn("[google-maps] distance matrix: bad JSON", err);
    return null;
  }
  if (json.status !== "OK" || !json.rows || json.rows.length !== candidates.length) {
    if (json.status !== "OK") console.warn("[google-maps] distance matrix status", json.status);
    return null;
  }

  const out = new Map<string, RoadDistance>();
  candidates.forEach((c, i) => {
    const el = json.rows![i]?.elements?.[0];
    if (!el || el.status !== "OK" || !el.distance) return;
    const durationSec = el.duration_in_traffic?.value ?? el.duration?.value;
    if (durationSec == null) return;
    out.set(c.id, { distanceKm: el.distance.value / 1000, durationMin: durationSec / 60 });
  });

  // Require a result for every candidate — see docstring.
  return out.size === candidates.length ? out : null;
}

export type LiveRoute = { distanceKm: number; durationMin: number };

type DirectionsResponse = {
  status: string;
  routes?: {
    legs: {
      distance: { value: number };
      duration: { value: number };
      duration_in_traffic?: { value: number };
    }[];
  }[];
};

/** Live-traffic driving route between two points via the Directions API. */
export async function getLiveRoute(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<LiveRoute | null> {
  const apiKey = config.maps.google.apiKey;
  if (!apiKey) return null;

  const url =
    "https://maps.googleapis.com/maps/api/directions/json" +
    `?origin=${originLat},${originLng}` +
    `&destination=${destLat},${destLng}` +
    "&mode=driving&departure_time=now" +
    `&key=${apiKey}`;

  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;

  let json: DirectionsResponse;
  try {
    json = (await res.json()) as DirectionsResponse;
  } catch (err) {
    console.warn("[google-maps] directions: bad JSON", err);
    return null;
  }
  const leg = json.routes?.[0]?.legs?.[0];
  if (json.status !== "OK" || !leg) {
    if (json.status !== "OK") console.warn("[google-maps] directions status", json.status);
    return null;
  }

  const durationSec = leg.duration_in_traffic?.value ?? leg.duration.value;
  return { distanceKm: leg.distance.value / 1000, durationMin: durationSec / 60 };
}
