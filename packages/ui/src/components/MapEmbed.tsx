import React, { memo, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

type Point = { lat: number; lng: number; label?: string };

type Props = {
  pickup: Point;
  driver?: Point | null;
  height?: number;
  /**
   * Map tiles. Default: OpenStreetMap (free, no API key, ~1 req per tile per
   * load). Pass a Google Static Maps URL pattern here later if/when a Maps
   * key is provisioned — both layouts compose the same way.
   */
  tileUrl?: string;
  tileAttribution?: string;
};

const DEFAULT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_TILE_ATTR = "© OpenStreetMap";

/**
 * Inline map rendered via Leaflet inside a WebView. Used in LiveTrackingScreen
 * (user) and TripScreen (driver) so patients/drivers see pickup + live driver
 * position without bouncing out to Google Maps. The external "Open in Google
 * Maps" button still exists as a secondary action for full turn-by-turn nav.
 *
 * Tiles default to OpenStreetMap (free, no key). Swap to Google Static Maps
 * tile URLs later when a Maps API key is provisioned — no other call-site
 * change required.
 */
function MapEmbedInner({
  pickup,
  driver,
  height = 220,
  tileUrl = DEFAULT_TILE_URL,
  tileAttribution = DEFAULT_TILE_ATTR
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const html = useMemo(() => {
    const pLat = Number(pickup.lat).toFixed(6);
    const pLng = Number(pickup.lng).toFixed(6);
    const dLat = driver ? Number(driver.lat).toFixed(6) : "null";
    const dLng = driver ? Number(driver.lng).toFixed(6) : "null";
    const pLabel = JSON.stringify(pickup.label ?? "Pickup");
    const dLabel = JSON.stringify(driver?.label ?? "Driver");
    const safeAttr = JSON.stringify(tileAttribution);
    const safeTileUrl = JSON.stringify(tileUrl);
    // The HTML is regenerated only when coords / labels change. Leaflet itself
    // is loaded from unpkg the first time; subsequent loads are cache-served
    // on Android's WebView. ~80 KB JS, ~14 KB CSS — small enough that we
    // accept the network hit for the dev simplicity gain.
    return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>html,body,#map{height:100%;margin:0;padding:0;background:#eef2f7}.leaflet-bar a{color:#0F172A}</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  var pickup = [${pLat}, ${pLng}];
  var driver = ${dLat === "null" ? "null" : `[${dLat}, ${dLng}]`};
  var map = L.map('map', {zoomControl: true, attributionControl: false}).setView(pickup, 14);
  L.tileLayer(${safeTileUrl}, {attribution: ${safeAttr}, maxZoom: 19}).addTo(map);

  var pickupIcon = L.divIcon({
    className: 'jr-pickup',
    html: '<div style="background:#E5322B;color:#fff;font-weight:700;padding:6px 10px;border-radius:14px;font-family:-apple-system,Roboto,sans-serif;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;">'+ ${pLabel} +'</div>',
    iconSize: null,
    iconAnchor: [40, 14]
  });
  L.marker(pickup, {icon: pickupIcon}).addTo(map);

  if (driver) {
    var driverIcon = L.divIcon({
      className: 'jr-driver',
      html: '<div style="background:#1E5EFF;color:#fff;font-weight:700;padding:6px 10px;border-radius:14px;font-family:-apple-system,Roboto,sans-serif;font-size:12px;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;">' + ${dLabel} + '</div>',
      iconSize: null,
      iconAnchor: [30, 14]
    });
    L.marker(driver, {icon: driverIcon}).addTo(map);
    // Auto-fit both markers in view with a touch of padding.
    var group = L.featureGroup([
      L.marker(pickup),
      L.marker(driver)
    ]);
    map.fitBounds(group.getBounds().pad(0.5));
  }
})();
</script>
</body></html>`;
  }, [pickup.lat, pickup.lng, pickup.label, driver?.lat, driver?.lng, driver?.label, tileUrl, tileAttribution]);

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        onLoadEnd={() => setLoaded(true)}
        // Block obvious dev-loop wastefulness on this WebView. The map doesn't
        // need cookies, file access, or hardware acceleration outside the
        // tile renderer.
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        androidLayerType="hardware"
      />
      {!loaded ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="tiny" tone="muted" style={{ marginTop: space.xs }}>
            Loading map…
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#EEF2F7"
  },
  web: { flex: 1, backgroundColor: "transparent" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(238, 242, 247, 0.85)"
  }
});

export const MapEmbed = memo(MapEmbedInner);
