"use client";

import React, { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import { useMapTiles } from "../../../useMapTiles";

type Point = { lat: number; lng: number; label: string };

// 2026-08-12: admin visibility into a live trip's driver position, matching
// what the user app already shows. Web context (not React Native), so this
// uses Leaflet directly against a DOM node rather than the RN MapEmbed's
// WebView approach; same pin styling for visual consistency across surfaces.
function pinIcon(L: typeof import("leaflet"), label: string, color: string) {
  const safe = label.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  return L.divIcon({
    className: "",
    html:
      `<div style="text-align:center;transform:translate(-50%,-100%)">` +
      `<span style="background:${color};color:#fff;font-weight:700;padding:4px 9px;border-radius:12px;font-size:11px;letter-spacing:.3px;box-shadow:0 4px 10px rgba(0,0,0,.25);white-space:nowrap;display:inline-block">${safe}</span>` +
      `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);margin:5px auto 0"></div>` +
      `</div>`,
    iconSize: undefined,
    iconAnchor: [0, 0]
  });
}

export function AdminLiveMap({
  pickup,
  driver,
  drop,
  height = 320
}: {
  pickup: Point;
  driver: Point | null;
  drop: Point | null;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markersRef = useRef<{ pickup?: import("leaflet").Marker; driver?: import("leaflet").Marker; drop?: import("leaflet").Marker }>({});
  const tileLayerRef = useRef<import("leaflet").TileLayer | null>(null);
  const tiles = useMapTiles();
  // Read through a ref inside the create-once effect so resolving tiles
  // never re-runs it; the effect below repoints the layer in place.
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current, { attributionControl: false }).setView([pickup.lat, pickup.lng], 13);
      tileLayerRef.current = L.tileLayer(tilesRef.current.tileUrl, {
        maxZoom: 19,
        attribution: tilesRef.current.tileAttribution
      }).addTo(map);
      mapRef.current = map;
      markersRef.current.pickup = L.marker([pickup.lat, pickup.lng], { icon: pinIcon(L, pickup.label, "#E5322B") }).addTo(map);
      if (driver) markersRef.current.driver = L.marker([driver.lat, driver.lng], { icon: pinIcon(L, driver.label, "#1E5EFF") }).addTo(map);
      if (drop) markersRef.current.drop = L.marker([drop.lat, drop.lng], { icon: pinIcon(L, drop.label, "#0F172A") }).addTo(map);
      const pts: [number, number][] = [[pickup.lat, pickup.lng]];
      if (driver) pts.push([driver.lat, driver.lng]);
      if (drop) pts.push([drop.lat, drop.lng]);
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts).pad(0.35));
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
    // Map instance is created once; subsequent coordinate changes update the
    // existing markers in place via the effect below (no reload/flicker).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      if (!map) return;
      markersRef.current.pickup?.setLatLng([pickup.lat, pickup.lng]);
      if (driver) {
        if (markersRef.current.driver) markersRef.current.driver.setLatLng([driver.lat, driver.lng]);
        else markersRef.current.driver = L.marker([driver.lat, driver.lng], { icon: pinIcon(L, driver.label, "#1E5EFF") }).addTo(map);
      } else if (markersRef.current.driver) {
        markersRef.current.driver.remove();
        markersRef.current.driver = undefined;
      }
      if (drop) {
        if (markersRef.current.drop) markersRef.current.drop.setLatLng([drop.lat, drop.lng]);
        else markersRef.current.drop = L.marker([drop.lat, drop.lng], { icon: pinIcon(L, drop.label, "#0F172A") }).addTo(map);
      }
    })();
  }, [pickup.lat, pickup.lng, driver?.lat, driver?.lng, driver?.label, drop?.lat, drop?.lng]);

  // v2.2.0: the tile source resolves asynchronously, so repoint the existing
  // layer rather than rebuilding the map (which would drop pan/zoom state).
  useEffect(() => {
    tileLayerRef.current?.setUrl(tiles.tileUrl);
  }, [tiles.tileUrl]);

  return <div ref={containerRef} style={{ height, borderRadius: 12, overflow: "hidden", background: "#EEF2F7" }} />;
}
