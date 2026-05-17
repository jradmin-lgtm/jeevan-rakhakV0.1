import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { Button, Text, colors, radius, space } from "@jr/ui";
import { useT } from "../i18n";

declare const process: { env: Record<string, string | undefined> };

/**
 * v1.0.13: in-app drop-location map picker. Uber-style fixed-pin pattern —
 * the red pin stays glued to the centre of the screen, and the map slides
 * underneath. Whatever's at the centre is "what you're picking". Tap
 * "Confirm" to return the coords + a reverse-geocoded label.
 *
 * Why a Leaflet WebView (not react-native-maps + Google):
 *  - Zero new native dependencies — same pattern as MapEmbed.
 *  - No Google Maps API key + billing setup needed.
 *  - Reverse-geocoding via Nominatim (OSM) is free, no key, polite about
 *    rate limits if we debounce (we do, ~700ms after the user stops
 *    panning).
 *
 * The map starts centred on the patient's pickup so the most common case
 * — picking a nearby hospital — needs only a small drag. If pickup isn't
 * known yet, we fall back to an India-wide view (so the user can search
 * via map gestures rather than seeing the ocean).
 */

type Coords = { lat: number; lng: number };

type Props = {
  visible: boolean;
  initialCenter: Coords | null;
  onCancel: () => void;
  onConfirm: (picked: { lat: number; lng: number; address: string }) => void;
};

// Nominatim's usage policy asks for a unique User-Agent + 1 req/sec max.
// We send the email so OSM can reach us if we ever misbehave.
const NOMINATIM_UA = "JeevanRakshak/1.0 (contact.jeevanrakshak@gmail.com)";

export function DropLocationPicker({ visible, initialCenter, onCancel, onConfirm }: Props) {
  const { t } = useT();
  // Fallback centre: roughly central India. Zooming out from here gives the
  // user the whole country to scroll across without seeing blank ocean.
  const startCenter: Coords = initialCenter ?? { lat: 22.0, lng: 78.0 };
  const startZoom = initialCenter ? 16 : 5;

  const [center, setCenter] = useState<Coords>(startCenter);
  const [label, setLabel] = useState<string>(t("drop_picker.detecting"));
  const [resolving, setResolving] = useState<boolean>(false);
  const [mapReady, setMapReady] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rebuild the HTML only when the picker is first opened. Coord updates
  // come via postMessage from the embedded JS so the WebView itself never
  // reloads (same pattern as MapEmbed v1.0.12).
  const html = useMemo(() => buildHtml(startCenter, startZoom), [visible]);

  // Reverse-geocode the current centre via Nominatim, debounced. Renders
  // "Hospital Name, City" — or falls back to coords if Nominatim fails or
  // rate-limits us (which is fine; the coords are still captured).
  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setResolving(true);
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${center.lat}&lon=${center.lng}&zoom=18&addressdetails=1`;
        const res = await fetch(url, {
          headers: { "User-Agent": NOMINATIM_UA, "Accept-Language": "en-IN,en;q=0.8" }
        });
        if (!res.ok) throw new Error("nominatim");
        const data: any = await res.json();
        const display = (data?.display_name as string | undefined) ?? null;
        if (display) {
          // Trim to first 3 comma-separated tokens — "Apollo Hospitals,
          // Sarita Vihar, New Delhi" is much more readable than the full
          // postal-grade response.
          const parts = display.split(",").map((s: string) => s.trim()).filter(Boolean);
          setLabel(parts.slice(0, 4).join(", "));
        } else {
          setLabel(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
        }
      } catch {
        // Nominatim flaked or rate-limited — show the raw coords so the
        // pin is still useful even if the label isn't human-readable.
        setLabel(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
      } finally {
        setResolving(false);
      }
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [center.lat, center.lng, visible]);

  return (
    <Modal visible={visible} onRequestClose={onCancel} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <WebView
          originWhitelist={["*"]}
          source={{ html }}
          style={styles.web}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          onLoadEnd={() => setMapReady(true)}
          onMessage={(event) => {
            // WebView's embedded JS posts coord updates whenever the map
            // is panned/zoomed (debounced inside the page itself too).
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === "center" && typeof msg.lat === "number" && typeof msg.lng === "number") {
                setCenter({ lat: msg.lat, lng: msg.lng });
              }
            } catch {
              /* malformed payload — ignore */
            }
          }}
        />

        {/* Fixed centre pin — overlay, doesn't move with the map. Uber-style. */}
        <View pointerEvents="none" style={styles.pinOverlay}>
          <View style={styles.pinShadow} />
          <View style={styles.pin}>
            <View style={styles.pinDot} />
          </View>
        </View>

        {/* Loading skeleton until WebView's onLoadEnd fires. */}
        {!mapReady ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.primary} />
            <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>
              {t("drop_picker.loading_map")}
            </Text>
          </View>
        ) : null}

        {/* Floating header — back + title. Absolute so the map stretches
          * to fullscreen, easier to drag. */}
        <View style={styles.headerOverlay}>
          <Pressable onPress={onCancel} style={styles.headerBack} android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: true }}>
            <Text variant="heading" weight="bold" style={{ color: colors.textPrimary }}>←</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="bold">{t("drop_picker.title")}</Text>
            <Text variant="tiny" tone="muted">{t("drop_picker.subtitle")}</Text>
          </View>
        </View>

        {/* Bottom card — current address + confirm CTA. */}
        <View style={styles.bottomCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={styles.bottomPinIcon} />
            <View style={{ flex: 1 }}>
              <Text variant="tiny" tone="secondary" weight="bold">{t("drop_picker.selected")}</Text>
              <Text variant="body" weight="semi" numberOfLines={2}>
                {resolving ? `${label} …` : label}
              </Text>
            </View>
          </View>
          <Button
            label={t("drop_picker.confirm")}
            onPress={() => onConfirm({ lat: center.lat, lng: center.lng, address: label })}
            fullWidth
            size="lg"
            disabled={!mapReady}
            testID="drop-picker-confirm"
          />
        </View>
      </View>
    </Modal>
  );
}

function buildHtml(initial: Coords, zoom: number): string {
  // Same Leaflet + CartoDB Voyager stack as MapEmbed. The crucial trick:
  // we listen to `move` events (not `moveend`) and debounce inside the
  // page so React Native gets one update per ~200ms even on a fast drag.
  const tileUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const attr = "© OpenStreetMap · © CARTO";
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
html,body,#map{height:100%;margin:0;padding:0;background:#eef2f7;font-family:-apple-system,Roboto,sans-serif}
.leaflet-control-zoom,.leaflet-bottom.leaflet-right,.leaflet-control-attribution{display:none !important}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${initial.lat}, ${initial.lng}], ${zoom});
  L.tileLayer(${JSON.stringify(tileUrl)}, { attribution: ${JSON.stringify(attr)}, maxZoom: 19, detectRetina: true }).addTo(map);

  // Push centre updates to the host. We listen to 'move' (fires
  // continuously during a drag) and debounce so we don't spam the host
  // / reverse-geocoder during a long pan. 200ms is the sweet spot — fast
  // enough that the label feels live, slow enough to be polite.
  var dt = null;
  function postCenter() {
    if (!window.ReactNativeWebView) return;
    var c = map.getCenter();
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'center', lat: c.lat, lng: c.lng }));
  }
  map.on('move', function(){
    if (dt) clearTimeout(dt);
    dt = setTimeout(postCenter, 200);
  });
  // Initial broadcast so the host gets the starting coords without
  // requiring the user to nudge the map first.
  setTimeout(postCenter, 50);
})();
</script>
</body></html>`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#EEF2F7" },
  web: { flex: 1, backgroundColor: "transparent" },
  pinOverlay: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  pinShadow: {
    position: "absolute",
    width: 18,
    height: 6,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.18)",
    transform: [{ translateY: 14 }]
  },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ translateY: -10 }]
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff"
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(238, 242, 247, 0.85)"
  },
  headerOverlay: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    paddingTop: 48,
    paddingHorizontal: space.md,
    paddingBottom: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.04)"
  },
  headerBack: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center"
  },
  bottomCard: {
    position: "absolute",
    left: space.md, right: space.md, bottom: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: "#fff",
    gap: space.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6
  },
  bottomPinIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 2
  }
});
