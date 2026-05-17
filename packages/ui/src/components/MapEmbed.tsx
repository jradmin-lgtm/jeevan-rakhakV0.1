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
<style>
html,body,#map{height:100%;margin:0;padding:0;background:#eef2f7;font-family:-apple-system,Roboto,sans-serif}
.leaflet-control-zoom,.leaflet-bottom.leaflet-right,.leaflet-control-attribution{display:none !important}
.jr-pin{transform:translate(-50%,-100%);pointer-events:none}
.jr-pin .label{background:#E5322B;color:#fff;font-weight:700;padding:5px 10px;border-radius:14px;font-size:11px;letter-spacing:.3px;box-shadow:0 6px 14px rgba(229,50,43,.35), 0 2px 4px rgba(0,0,0,.2);white-space:nowrap;display:inline-block}
.jr-pin .label.driver{background:#1E5EFF;box-shadow:0 6px 14px rgba(30,94,255,.35), 0 2px 4px rgba(0,0,0,.2)}
.jr-pin .dot{width:14px;height:14px;border-radius:50%;background:#E5322B;border:3px solid #fff;box-shadow:0 0 0 4px rgba(229,50,43,.18), 0 4px 10px rgba(0,0,0,.25);margin:6px auto 0;position:relative}
.jr-pin .dot.driver{background:#1E5EFF;box-shadow:0 0 0 4px rgba(30,94,255,.18), 0 4px 10px rgba(0,0,0,.25)}
.jr-pin .pulse{position:absolute;top:50%;left:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#1E5EFF;animation:jrPulse 1.6s ease-out infinite;opacity:.7}
@keyframes jrPulse {
  0% { transform:scale(1); opacity:.7 }
  100% { transform:scale(3.2); opacity:0 }
}
.jr-route{stroke:#1E5EFF;stroke-width:3;stroke-dasharray:8 6;stroke-linecap:round;fill:none;opacity:.9}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  var pickup = [${pLat}, ${pLng}];
  var driver = ${dLat === "null" ? "null" : `[${dLat}, ${dLng}]`};
  var map = L.map('map', {zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false, doubleClickZoom: false}).setView(pickup, 14);
  L.tileLayer(${safeTileUrl}, {attribution: ${safeAttr}, maxZoom: 19}).addTo(map);

  function makePin(label, kind){
    var labelCls = kind === 'driver' ? 'label driver' : 'label';
    var dotCls   = kind === 'driver' ? 'dot driver'   : 'dot';
    var pulseHtml = kind === 'driver' ? '<span class="pulse"></span>' : '';
    return L.divIcon({
      className: 'jr-pin',
      html: '<div style="text-align:center"><span class="'+labelCls+'">'+label+'</span><div class="'+dotCls+'">'+pulseHtml+'</div></div>',
      iconSize: null,
      iconAnchor: [0, 0]
    });
  }

  L.marker(pickup, {icon: makePin(${pLabel}, 'pickup')}).addTo(map);

  if (driver) {
    L.marker(driver, {icon: makePin(${dLabel}, 'driver')}).addTo(map);
    // Dashed route hint between driver and pickup
    L.polyline([driver, pickup], {className:'jr-route', dashArray:'8 6', color:'#1E5EFF', weight:3, opacity:.85}).addTo(map);
    // Auto-fit both markers in view with a touch of padding.
    var group = L.featureGroup([L.marker(pickup), L.marker(driver)]);
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
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // v1.0.11: removed `androidLayerType="hardware"` — caused the WebView
        // to render blank/white on driver-app TripScreen once the driver
        // accepted a ride (Android 10+ regression with hardware-layered
        // WebViews inside frequently-re-rendered parents). Default layer
        // behavior renders reliably; the perf cost is invisible at this
        // map's update rate.
        mixedContentMode="always"
        setSupportMultipleWindows={false}
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
