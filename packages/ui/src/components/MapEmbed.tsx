import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

type Point = { lat: number; lng: number; label?: string };

type Props = {
  pickup: Point;
  driver?: Point | null;
  drop?: Point | null;
  height?: number;
  /**
   * Map tiles. Default: CartoDB Voyager (free, no API key, friendlier
   * cartography for Indian cities than raw OSM). Pass any `{z}/{x}/{y}`
   * tile URL pattern to switch sources without changing call sites.
   */
  tileUrl?: string;
  tileAttribution?: string;
};

/**
 * v1.0.12 rewrite — was rebuilding the entire HTML on every driver-location
 * tick, which reloaded Leaflet from the CDN and made the pin "teleport" on
 * every 5s update. Now:
 *
 * 1. HTML is built ONCE on mount (initial coords only).
 * 2. Coord changes are pushed in via `injectJavaScript` — the existing map
 *    instance animates marker + polyline in place over ~1.2s, like Uber/
 *    Swiggy. No reload, no spinner flash.
 * 3. A "recenter" button overlays bottom-right so the user can re-frame
 *    after panning manually.
 *
 * Tiles default to CartoDB Voyager (free, key-less, friendlier for Indian
 * city density). To switch to Google Maps tiles later, pass `tileUrl` —
 * no other call-site change required.
 */
const DEFAULT_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const DEFAULT_TILE_ATTR = "© OpenStreetMap · © CARTO";

function MapEmbedInner({
  pickup,
  driver,
  drop,
  height = 240,
  tileUrl = DEFAULT_TILE_URL,
  tileAttribution = DEFAULT_TILE_ATTR
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const webRef = useRef<WebView | null>(null);

  // Lock the very first coords into a ref so the HTML stays stable across
  // re-renders. `useMemo` with [] deps doesn't satisfy React strict-mode
  // dev-time double-runs; a ref is the cleanest "compute once" primitive.
  const initialRef = useRef({
    pLat: Number(pickup.lat),
    pLng: Number(pickup.lng),
    pLabel: pickup.label ?? "Pickup",
    dLat: driver ? Number(driver.lat) : null,
    dLng: driver ? Number(driver.lng) : null,
    dLabel: driver?.label ?? "Driver",
    drLat: drop ? Number(drop.lat) : null,
    drLng: drop ? Number(drop.lng) : null,
    drLabel: drop?.label ?? "Drop",
    tileUrl,
    tileAttribution
  });

  const html = useMemo(() => buildHtml(initialRef.current), []);

  // Push driver/pickup/drop updates into the WebView without rebuilding.
  // Each call runs JS inside the existing Leaflet map → smooth animation.
  useEffect(() => {
    if (!loaded || !webRef.current) return;
    const payload = JSON.stringify({
      pickup: { lat: pickup.lat, lng: pickup.lng, label: pickup.label ?? "Pickup" },
      driver: driver ? { lat: driver.lat, lng: driver.lng, label: driver.label ?? "Driver" } : null,
      drop: drop ? { lat: drop.lat, lng: drop.lng, label: drop.label ?? "Drop" } : null
    });
    // `true;` at the end suppresses the warning about non-undefined eval.
    webRef.current.injectJavaScript(`window.jrMap && window.jrMap.update(${payload}); true;`);
  }, [loaded, pickup.lat, pickup.lng, pickup.label, driver?.lat, driver?.lng, driver?.label, drop?.lat, drop?.lng, drop?.label]);

  const recenter = () => {
    if (!webRef.current) return;
    webRef.current.injectJavaScript("window.jrMap && window.jrMap.recenter(); true;");
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        ref={webRef}
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
        // WebViews inside frequently-re-rendered parents).
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        cacheEnabled
      />
      {!loaded ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="tiny" tone="muted" style={{ marginTop: space.xs }}>
            Loading map…
          </Text>
        </View>
      ) : (
        <Pressable onPress={recenter} style={styles.recenterBtn} android_ripple={{ color: "rgba(229,50,43,0.12)", borderless: false }}>
          <Text style={styles.recenterIcon}>⊕</Text>
        </Pressable>
      )}
    </View>
  );
}

function buildHtml(init: {
  pLat: number; pLng: number; pLabel: string;
  dLat: number | null; dLng: number | null; dLabel: string;
  drLat: number | null; drLng: number | null; drLabel: string;
  tileUrl: string; tileAttribution: string;
}): string {
  // All initial values inlined into the HTML; subsequent updates come via
  // window.jrMap.update(...) from injectJavaScript.
  const initJson = JSON.stringify(init);
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
.jr-pin .label.drop{background:#0F172A;box-shadow:0 6px 14px rgba(15,23,42,.35), 0 2px 4px rgba(0,0,0,.2)}
.jr-pin .dot{width:14px;height:14px;border-radius:50%;background:#E5322B;border:3px solid #fff;box-shadow:0 0 0 4px rgba(229,50,43,.18), 0 4px 10px rgba(0,0,0,.25);margin:6px auto 0;position:relative}
.jr-pin .dot.driver{background:#1E5EFF;box-shadow:0 0 0 4px rgba(30,94,255,.18), 0 4px 10px rgba(0,0,0,.25)}
.jr-pin .dot.drop{background:#0F172A;box-shadow:0 0 0 4px rgba(15,23,42,.18), 0 4px 10px rgba(0,0,0,.25)}
.jr-pin .pulse{position:absolute;top:50%;left:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#1E5EFF;animation:jrPulse 1.6s ease-out infinite;opacity:.7}
@keyframes jrPulse {
  0% { transform:scale(1); opacity:.7 }
  100% { transform:scale(3.2); opacity:0 }
}
.jr-route{stroke:#1E5EFF;stroke-width:4;stroke-linecap:round;fill:none;opacity:.85}
.jr-trail{stroke:#1E5EFF;stroke-width:3;stroke-linecap:round;fill:none;opacity:.45}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  var INIT = ${initJson};

  function makePin(label, kind){
    var labelCls = 'label' + (kind ? ' ' + kind : '');
    var dotCls   = 'dot'   + (kind ? ' ' + kind : '');
    var pulseHtml = kind === 'driver' ? '<span class="pulse"></span>' : '';
    var safeLabel = String(label).replace(/[&<>]/g, function(c){ return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'; });
    return L.divIcon({
      className: 'jr-pin',
      html: '<div style="text-align:center"><span class="'+labelCls+'">'+safeLabel+'</span><div class="'+dotCls+'"></div></div>',
      iconSize: null,
      iconAnchor: [0, 0]
    });
  }

  var pickup = [INIT.pLat, INIT.pLng];
  var initialDriver = (INIT.dLat != null && INIT.dLng != null) ? [INIT.dLat, INIT.dLng] : null;
  var initialDrop   = (INIT.drLat != null && INIT.drLng != null) ? [INIT.drLat, INIT.drLng] : null;

  var map = L.map('map', { zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false, doubleClickZoom: false }).setView(pickup, 14);
  L.tileLayer(INIT.tileUrl, { attribution: INIT.tileAttribution, maxZoom: 19, detectRetina: true }).addTo(map);

  var pickupMarker = L.marker(pickup, { icon: makePin(INIT.pLabel, 'pickup') }).addTo(map);
  var driverMarker = initialDriver ? L.marker(initialDriver, { icon: makePin(INIT.dLabel, 'driver') }).addTo(map) : null;
  var dropMarker   = initialDrop   ? L.marker(initialDrop,   { icon: makePin(INIT.drLabel, 'drop')   }).addTo(map) : null;
  var route = null;
  var trail = null;
  var trailCoords = initialDriver ? [initialDriver.slice()] : [];

  function refreshRoute(){
    if (!driverMarker) {
      if (route) { map.removeLayer(route); route = null; }
      return;
    }
    var from = driverMarker.getLatLng();
    var to = pickupMarker.getLatLng();
    if (route) { route.setLatLngs([from, to]); }
    else { route = L.polyline([from, to], { className: 'jr-route', color: '#1E5EFF', weight: 4, opacity: .85 }).addTo(map); }
  }

  function refreshTrail(){
    if (trailCoords.length < 2) {
      if (trail) { map.removeLayer(trail); trail = null; }
      return;
    }
    if (trail) { trail.setLatLngs(trailCoords); }
    else { trail = L.polyline(trailCoords, { className: 'jr-trail', color: '#1E5EFF', weight: 3, opacity: .45 }).addTo(map); }
  }

  function fitAll(animate){
    var pts = [pickupMarker];
    if (driverMarker) pts.push(driverMarker);
    if (dropMarker) pts.push(dropMarker);
    if (pts.length < 2) return;
    var group = L.featureGroup(pts);
    map.fitBounds(group.getBounds().pad(0.4), { animate: !!animate, duration: 0.7 });
  }

  refreshRoute();
  fitAll(false);

  // Smooth pin animation: interpolate from current to target over ~1.2s.
  // Way nicer than instant teleport when the driver actually moves a block.
  function animateMarkerTo(marker, target){
    if (!marker) return;
    var start = marker.getLatLng();
    var startLat = start.lat, startLng = start.lng;
    var endLat = target[0], endLng = target[1];
    if (Math.abs(startLat - endLat) < 1e-6 && Math.abs(startLng - endLng) < 1e-6) return;
    var dur = 1200;
    var t0 = performance.now();
    function step(t){
      var p = Math.min(1, (t - t0) / dur);
      // ease-out cubic — fast first, then settles
      var e = 1 - Math.pow(1 - p, 3);
      var lat = startLat + (endLat - startLat) * e;
      var lng = startLng + (endLng - startLng) * e;
      marker.setLatLng([lat, lng]);
      refreshRoute();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function ensureMarker(label, kind, ref){
    if (ref) return ref;
    return L.marker(pickup, { icon: makePin(label, kind) }).addTo(map);
  }

  window.jrMap = {
    update: function(payload){
      try {
        if (payload.pickup) {
          pickupMarker.setLatLng([payload.pickup.lat, payload.pickup.lng]);
        }
        if (payload.driver) {
          var dpt = [payload.driver.lat, payload.driver.lng];
          if (!driverMarker) {
            driverMarker = L.marker(dpt, { icon: makePin(payload.driver.label || 'Driver', 'driver') }).addTo(map);
            trailCoords = [dpt.slice()];
            fitAll(true);
          } else {
            animateMarkerTo(driverMarker, dpt);
            var last = trailCoords.length ? trailCoords[trailCoords.length - 1] : null;
            if (!last || Math.abs(last[0] - dpt[0]) > 1e-5 || Math.abs(last[1] - dpt[1]) > 1e-5) {
              trailCoords.push(dpt.slice());
              if (trailCoords.length > 40) trailCoords.shift();
            }
          }
          refreshTrail();
        } else if (driverMarker) {
          map.removeLayer(driverMarker);
          driverMarker = null;
          trailCoords = [];
          refreshTrail();
          refreshRoute();
        }
        if (payload.drop) {
          var drpt = [payload.drop.lat, payload.drop.lng];
          if (!dropMarker) {
            dropMarker = L.marker(drpt, { icon: makePin(payload.drop.label || 'Drop', 'drop') }).addTo(map);
            fitAll(true);
          } else {
            animateMarkerTo(dropMarker, drpt);
          }
        } else if (dropMarker) {
          map.removeLayer(dropMarker);
          dropMarker = null;
        }
      } catch (e) {
        // Don't crash the WebView on a bad update — drop it and keep the
        // current frame visible.
      }
    },
    recenter: function(){ fitAll(true); }
  };

  // Tell the host the map is ready (handy for diagnostics).
  if (window.ReactNativeWebView) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'jr:map:ready' })); } catch (e) {}
  }
})();
</script>
</body></html>`;
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#EEF2F7",
    position: "relative"
  },
  web: { flex: 1, backgroundColor: "transparent" },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(238, 242, 247, 0.85)"
  },
  recenterBtn: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3
  },
  recenterIcon: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.primary,
    lineHeight: 24
  }
});

export const MapEmbed = memo(MapEmbedInner);
