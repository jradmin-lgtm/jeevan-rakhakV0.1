import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";
import { buildEmbedHtml } from "../maps/embedHtml";

type Point = { lat: number; lng: number; label?: string };

/**
 * v2.2.0: server-driven map provider. Shape matches GET /api/v1/map-config.
 * Both apps resolve it through `useMapConfig()`; see routes/map-config.ts for
 * why this stopped being a hardcoded constant.
 */
export type MapProviderConfig = {
  provider: "google" | "osm";
  googleBrowserKey: string;
  tileUrl: string;
  tileAttribution: string;
};

type Props = {
  pickup: Point;
  driver?: Point | null;
  drop?: Point | null;
  height?: number;
  /**
   * v1.1.0 (CR#3/#6): optional real road-route geometry as an ordered list of
   * [lat, lng] pairs (e.g. from OSRM via `fetchOsrmRoute`). When provided it's
   * drawn as the primary navigation route and the straight driver→pickup line
   * is suppressed.
   */
  routePath?: Array<[number, number]> | null;
  /**
   * v2.2.0: which renderer to use. Omit and the map falls back to Leaflet +
   * OSM raster tiles, which always works without a key. Pass the value from
   * `useMapConfig()` to get the real Google Maps UI when a browser key is
   * configured on the server.
   */
  mapConfig?: MapProviderConfig | null;
};

/**
 * v1.0.12 rewrite — was rebuilding the entire HTML on every driver-location
 * tick, which reloaded the map library from the CDN and made the pin
 * "teleport" on every 5s update. Now:
 *
 * 1. HTML is built ONCE on mount (initial coords only).
 * 2. Coord changes are pushed in via `injectJavaScript` — the existing map
 *    instance animates marker + polyline in place over ~1.2s, like Uber/
 *    Swiggy. No reload, no spinner flash.
 * 3. A "recenter" button overlays bottom-right so the user can re-frame
 *    after panning manually.
 *
 * v2.2.0 — renderer is now chosen at runtime from `mapConfig`:
 *
 * - `google` draws the real Google Maps UI (Maps JavaScript API), with the
 *   existing JR pin design preserved via custom OverlayViews so the map looks
 *   like Google Maps but the pins still look like ours.
 * - `osm` draws Leaflet + OpenStreetMap raster tiles.
 *
 * The Google path carries the Leaflet path with it as a LIVE FALLBACK: if the
 * key is rejected (`gm_authFailure`), the script fails to load, or the map has
 * not initialised within 6s, it self-heals to Leaflet + OSM. A blank map
 * during a live ambulance ride is a real operational failure, so this surface
 * degrades rather than fails.
 *
 * Both renderers expose the identical `window.jrMap.update()/.recenter()`
 * contract, so nothing at the call sites changes.
 */
const OSM_FALLBACK: MapProviderConfig = {
  provider: "osm",
  googleBrowserKey: "",
  tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution: "© OpenStreetMap contributors"
};

function MapEmbedInner({
  pickup,
  driver,
  drop,
  height = 240,
  routePath = null,
  mapConfig = null
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const webRef = useRef<WebView | null>(null);

  const cfg = mapConfig && mapConfig.provider ? mapConfig : OSM_FALLBACK;

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
    routePath: routePath ?? null
  });

  // The renderer is baked into the HTML, so the map must remount if the
  // provider resolves AFTER first paint (fallback OSM -> server-provided
  // Google). Keying the WebView on the provider identity does exactly that,
  // and only that: coord updates still stream in without a reload.
  const providerKey = `${cfg.provider}:${cfg.googleBrowserKey ? "k" : "nk"}`;

  const html = useMemo(
    () => buildEmbedHtml(initialRef.current, cfg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [providerKey]
  );

  // Push driver/pickup/drop updates into the WebView without rebuilding.
  // Each call runs JS inside the existing map → smooth animation.
  // Cheap stable key for the route geometry so the effect only re-injects
  // when the path actually changes (not on every parent re-render).
  const routeKey = useMemo(() => {
    if (!routePath || routePath.length === 0) return "";
    const a = routePath[0];
    const b = routePath[routePath.length - 1];
    return `${routePath.length}:${a[0]},${a[1]}>${b[0]},${b[1]}`;
  }, [routePath]);

  useEffect(() => {
    if (!loaded || !webRef.current) return;
    const payload = JSON.stringify({
      pickup: { lat: pickup.lat, lng: pickup.lng, label: pickup.label ?? "Pickup" },
      driver: driver ? { lat: driver.lat, lng: driver.lng, label: driver.label ?? "Driver" } : null,
      drop: drop ? { lat: drop.lat, lng: drop.lng, label: drop.label ?? "Drop" } : null,
      routePath: routePath && routePath.length > 1 ? routePath : null
    });
    // `true;` at the end suppresses the warning about non-undefined eval.
    // Queued when the renderer has not finished booting (Google loads async,
    // and the fallback can swap in later) so no update is ever dropped.
    webRef.current.injectJavaScript(
      `(window.jrMap ? window.jrMap.update(${payload}) : (window.jrPending = ${payload})); true;`
    );
  }, [loaded, pickup.lat, pickup.lng, pickup.label, driver?.lat, driver?.lng, driver?.label, drop?.lat, drop?.lng, drop?.label, routeKey, providerKey]);

  const recenter = () => {
    if (!webRef.current) return;
    webRef.current.injectJavaScript("window.jrMap && window.jrMap.recenter(); true;");
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        key={providerKey}
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
