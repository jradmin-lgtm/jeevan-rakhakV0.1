"use client";

import { useEffect, useState } from "react";

/**
 * v2.2.0 — resolves the basemap tiles for admin-web's Leaflet maps from the
 * server instead of a hardcoded constant. See app/api/map-config/route.ts.
 *
 * Starts on the safe OSM default so a map always renders on first paint, then
 * swaps if the server names a different source. The result is memoised at
 * module scope, so mounting several maps costs one request per page load.
 */
export type MapTiles = { tileUrl: string; tileAttribution: string };

const FALLBACK: MapTiles = {
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: "© OpenStreetMap contributors"
};

let cache: Promise<MapTiles> | null = null;

function load(): Promise<MapTiles> {
  if (!cache) {
    cache = fetch("/api/map-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : FALLBACK))
      .then((c) => (c?.tileUrl ? { tileUrl: c.tileUrl, tileAttribution: c.tileAttribution ?? "" } : FALLBACK))
      .catch(() => FALLBACK);
  }
  return cache;
}

export function useMapTiles(): MapTiles {
  const [tiles, setTiles] = useState<MapTiles>(FALLBACK);
  useEffect(() => {
    let alive = true;
    load().then((t) => {
      if (alive) setTiles(t);
    });
    return () => {
      alive = false;
    };
  }, []);
  return tiles;
}
