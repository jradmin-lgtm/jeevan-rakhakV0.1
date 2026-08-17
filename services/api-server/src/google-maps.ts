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
import { sql } from "drizzle-orm";
import { apiUsage, db } from "@jr/db";
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

/**
 * Best-effort usage counter, upserted per (provider, operation, UTC month).
 * Only called when a request actually reached Google (fetchWithTimeout
 * returned a Response) — a request that never left this process (aborted,
 * DNS failure, no network) never consumed quota, so it's never counted.
 * `units` is the quota-billed amount: Distance Matrix bills per element
 * (origins×destinations), Directions bills 1 per request. Never throws —
 * a usage-tracking hiccup must never affect dispatch/ETA.
 */
async function recordApiUsage(operation: string, units: number, ok: boolean, errorMessage?: string) {
  try {
    const period = new Date().toISOString().slice(0, 7); // "YYYY-MM", UTC
    const now = new Date();
    await db
      .insert(apiUsage)
      .values({
        provider: "google_maps",
        operation,
        period,
        calls: 1,
        units,
        errors: ok ? 0 : 1,
        lastCallAt: now,
        lastErrorAt: ok ? null : now,
        lastErrorMessage: ok ? null : (errorMessage ?? "unknown error")
      })
      .onConflictDoUpdate({
        target: [apiUsage.provider, apiUsage.operation, apiUsage.period],
        set: {
          calls: sql`${apiUsage.calls} + 1`,
          units: sql`${apiUsage.units} + ${units}`,
          errors: ok ? apiUsage.errors : sql`${apiUsage.errors} + 1`,
          lastCallAt: now,
          ...(ok ? {} : { lastErrorAt: now, lastErrorMessage: errorMessage ?? "unknown error" }),
          updatedAt: now
        }
      });
  } catch (err) {
    console.warn("[google-maps] usage tracking failed (non-fatal)", err);
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
  if (!res) return null; // never reached Google — no quota consumed, don't track
  const units = candidates.length; // Distance Matrix bills per element (origins×destinations)

  if (!res.ok) {
    void recordApiUsage("distance_matrix", units, false, `HTTP ${res.status}`);
    return null;
  }

  let json: DistanceMatrixResponse;
  try {
    json = (await res.json()) as DistanceMatrixResponse;
  } catch (err) {
    console.warn("[google-maps] distance matrix: bad JSON", err);
    void recordApiUsage("distance_matrix", units, false, "bad JSON response");
    return null;
  }
  if (json.status !== "OK" || !json.rows || json.rows.length !== candidates.length) {
    if (json.status !== "OK") console.warn("[google-maps] distance matrix status", json.status);
    void recordApiUsage("distance_matrix", units, false, json.status);
    return null;
  }
  void recordApiUsage("distance_matrix", units, true);

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

export type LiveRoute = { distanceKm: number; durationMin: number; path: [number, number][] };

type DirectionsResponse = {
  status: string;
  routes?: {
    overview_polyline?: { points: string };
    legs: {
      distance: { value: number };
      duration: { value: number };
      duration_in_traffic?: { value: number };
    }[];
  }[];
};

/**
 * Decodes a Google encoded polyline string into [lat, lng] pairs (the
 * standard Google polyline algorithm — https://developers.google.com/maps/
 * documentation/utilities/polylinealgorithm). No external dependency; this
 * is the entire algorithm in ~15 lines.
 */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/**
 * Live-traffic driving route between two points via the Directions API,
 * including the decoded route polyline so callers can draw the actual
 * traffic-aware road path instead of (or as well as) the free OSRM line.
 */
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
  if (!res) return null; // never reached Google — no quota consumed, don't track

  if (!res.ok) {
    void recordApiUsage("directions", 1, false, `HTTP ${res.status}`);
    return null;
  }

  let json: DirectionsResponse;
  try {
    json = (await res.json()) as DirectionsResponse;
  } catch (err) {
    console.warn("[google-maps] directions: bad JSON", err);
    void recordApiUsage("directions", 1, false, "bad JSON response");
    return null;
  }
  const route = json.routes?.[0];
  const leg = route?.legs?.[0];
  if (json.status !== "OK" || !leg) {
    if (json.status !== "OK") console.warn("[google-maps] directions status", json.status);
    void recordApiUsage("directions", 1, false, json.status);
    return null;
  }
  void recordApiUsage("directions", 1, true);

  const durationSec = leg.duration_in_traffic?.value ?? leg.duration.value;
  const path = route?.overview_polyline?.points ? decodePolyline(route.overview_polyline.points) : [];
  return { distanceKm: leg.distance.value / 1000, durationMin: durationSec / 60, path };
}

export type PlacePrediction = { placeId: string; description: string };

type AutocompleteResponse = {
  status: string;
  predictions?: { place_id: string; description: string }[];
};

/**
 * Places Autocomplete (Legacy) — free of charge per Google's own pricing
 * page ("This SKU will show up as $0 on your bill"). Session token bundles
 * a search's keystrokes with its eventual Details call for billing purposes
 * (caller-generated, same token reused across one search-to-selection flow).
 */
export async function getPlacesAutocomplete(
  input: string,
  sessionToken: string
): Promise<PlacePrediction[] | null> {
  const apiKey = config.maps.google.apiKey;
  if (!apiKey || !input.trim()) return null;

  const url =
    "https://maps.googleapis.com/maps/api/place/autocomplete/json" +
    `?input=${encodeURIComponent(input)}` +
    "&components=country:in" +
    `&sessiontoken=${encodeURIComponent(sessionToken)}` +
    `&key=${apiKey}`;

  const res = await fetchWithTimeout(url);
  if (!res) return null;

  if (!res.ok) {
    void recordApiUsage("places_autocomplete", 1, false, `HTTP ${res.status}`);
    return null;
  }
  let json: AutocompleteResponse;
  try {
    json = (await res.json()) as AutocompleteResponse;
  } catch (err) {
    void recordApiUsage("places_autocomplete", 1, false, "bad JSON response");
    return null;
  }
  // ZERO_RESULTS is a normal, successful outcome (no matches yet for a short
  // or unusual query) — only genuine API-level failures count as errors.
  const ok = json.status === "OK" || json.status === "ZERO_RESULTS";
  void recordApiUsage("places_autocomplete", 1, ok, ok ? undefined : json.status);
  if (!ok) return null;

  return (json.predictions ?? []).map((p) => ({ placeId: p.place_id, description: p.description }));
}

export type PlaceDetails = { lat: number; lng: number; formattedAddress: string };

type PlaceDetailsResponse = {
  status: string;
  result?: { geometry?: { location?: { lat: number; lng: number } }; formatted_address?: string };
};

/**
 * Place Details (Legacy) — the ONLY billed part of the autocomplete flow
 * (5,000 free requests/month, then $17/1000 per Google's pricing page).
 * Called once, when the user actually picks a prediction — never per
 * keystroke. Pass the SAME sessionToken used for the preceding Autocomplete
 * calls; generate a fresh token for the next search after this resolves.
 */
export async function getPlaceDetails(placeId: string, sessionToken: string): Promise<PlaceDetails | null> {
  const apiKey = config.maps.google.apiKey;
  if (!apiKey) return null;

  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${encodeURIComponent(placeId)}` +
    "&fields=geometry,formatted_address" +
    `&sessiontoken=${encodeURIComponent(sessionToken)}` +
    `&key=${apiKey}`;

  const res = await fetchWithTimeout(url);
  if (!res) return null;

  if (!res.ok) {
    void recordApiUsage("places_details", 1, false, `HTTP ${res.status}`);
    return null;
  }
  let json: PlaceDetailsResponse;
  try {
    json = (await res.json()) as PlaceDetailsResponse;
  } catch (err) {
    void recordApiUsage("places_details", 1, false, "bad JSON response");
    return null;
  }
  const loc = json.result?.geometry?.location;
  if (json.status !== "OK" || !loc) {
    void recordApiUsage("places_details", 1, false, json.status);
    return null;
  }
  void recordApiUsage("places_details", 1, true);

  return { lat: loc.lat, lng: loc.lng, formattedAddress: json.result?.formatted_address ?? "" };
}
