import { NextResponse } from "next/server";

/**
 * v2.2.0 — server-driven map config for the two admin-web Leaflet maps
 * (AdminLiveMap and HospitalMap).
 *
 * Both used to hardcode the CartoDB tile URL. On 2026-09-09 CARTO began
 * stamping "API KEY REQUIRED" across anonymous basemap tiles and every map in
 * the product broke at once. Reading the provider from the API means the next
 * swap is an env var on jr-api, not a code change in three repos' worth of
 * surfaces.
 *
 * Its own route rather than /api/proxy/* because the upstream endpoint is
 * public: this is reachable from both the admin session and the hospital
 * portal session without either proxy's auth gate.
 */
const API_BASE =
  process.env.JR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// Matches the API's own fail-safe. Deliberately NOT CartoDB.
const FALLBACK = {
  provider: "osm" as const,
  googleBrowserKey: "",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: "© OpenStreetMap contributors"
};

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/map-config`, {
      // Short revalidate so a provider change lands within minutes, without
      // hitting the API on every map mount.
      next: { revalidate: 300 }
    });
    if (!res.ok) return NextResponse.json(FALLBACK);
    const body = await res.json();
    return NextResponse.json(body?.provider ? body : FALLBACK);
  } catch {
    // A map that renders on free tiles beats a map that does not render.
    return NextResponse.json(FALLBACK);
  }
}
