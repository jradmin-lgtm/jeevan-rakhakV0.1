import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View
} from "react-native";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { Button, Text, colors, radius, space } from "@jr/ui";
import { useT } from "../i18n";

/**
 * v1.0.13 (revised): general-purpose map picker for both pickup and drop.
 * Adds a search-by-typing flow on top of the v1.0.13 drag-the-map picker.
 *
 * Two reasons people pick a location:
 *   1. They know the name ("Apollo Indraprastha") — type it, results list,
 *      tap, done. Map flies there + pin lands. This is the Ola/Uber path
 *      and is what the team asked for.
 *   2. They want a spot the map labels don't capture ("the side gate of the
 *      hospital, the third entrance off Ring Road"). The center-fixed pin
 *      + drag-the-map pattern handles that.
 *
 * Both paths share the same map + pin. The search results list is just an
 * overlay that vanishes once the user picks one or starts panning.
 *
 * Search uses Nominatim (OSM) — free, no API key. We bound to India via
 * `countrycodes=in` so results don't include Apollo Branches in the US.
 * Debounced 400ms; Nominatim's usage policy asks for ≤1 req/sec. Each
 * request carries the JR User-Agent so OSM can reach us if we misbehave.
 *
 * "Use my current location" — explicit button for either mode (we let
 * drop use GPS too, e.g. "I'm picking my mum up from her current location").
 */

type Coords = { lat: number; lng: number };

type Props = {
  visible: boolean;
  mode: "pickup" | "drop";
  initialCenter: Coords | null;
  onCancel: () => void;
  onConfirm: (picked: { lat: number; lng: number; address: string }) => void;
};

const NOMINATIM_UA = "JeevanRakshak/1.0 (contact.jeevanrakshak@gmail.com)";

type SearchResult = {
  lat: number;
  lng: number;
  primary: string;     // first comma-separated token, e.g. "Apollo Hospitals"
  secondary: string;   // remaining tokens trimmed to fit one line
};

export function MapLocationPicker({ visible, mode, initialCenter, onCancel, onConfirm }: Props) {
  const { t } = useT();
  // Country-wide default if nothing's known. India centre + zoomed-out so the
  // user can scroll instead of getting "stuck" on a default like Delhi.
  const startCenter: Coords = initialCenter ?? { lat: 22.5, lng: 78.5 };
  const startZoom = initialCenter ? 16 : 5;

  const [center, setCenter] = useState<Coords>(startCenter);
  const [label, setLabel] = useState<string>(t("drop_picker.detecting"));
  const [resolving, setResolving] = useState<boolean>(false);
  const [mapReady, setMapReady] = useState(false);
  const webRef = useRef<WebView | null>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);

  const debounceCenterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // HTML is built ONCE per modal open. Subsequent coord changes go through
  // injectJavaScript(window.jrMap.flyTo) so the WebView never reloads.
  const html = useMemo(() => buildHtml(startCenter, startZoom), [visible]);

  // Reverse-geocode whatever's at the centre of the map. Debounced so a
  // long pan doesn't fire one request per frame.
  useEffect(() => {
    if (!visible) return;
    if (debounceCenterRef.current) clearTimeout(debounceCenterRef.current);
    debounceCenterRef.current = setTimeout(async () => {
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
          const parts = display.split(",").map((s: string) => s.trim()).filter(Boolean);
          setLabel(parts.slice(0, 4).join(", "));
        } else {
          setLabel(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
        }
      } catch {
        setLabel(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
      } finally {
        setResolving(false);
      }
    }, 700);
    return () => {
      if (debounceCenterRef.current) clearTimeout(debounceCenterRef.current);
    };
  }, [center.lat, center.lng, visible]);

  // Autocomplete search. Empty query => hide the results list. Debounced
  // 400ms so we don't spam Nominatim with every keystroke.
  useEffect(() => {
    if (!visible) return;
    if (debounceSearchRef.current) clearTimeout(debounceSearchRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceSearchRef.current = setTimeout(async () => {
      setSearching(true);
      setShowResults(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&countrycodes=in&limit=8&addressdetails=1`;
        const res = await fetch(url, {
          headers: { "User-Agent": NOMINATIM_UA, "Accept-Language": "en-IN,en;q=0.8" }
        });
        if (!res.ok) throw new Error("nominatim_search");
        const data: any[] = await res.json();
        const rows: SearchResult[] = (Array.isArray(data) ? data : []).map((d) => {
          const parts = String(d.display_name ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
          return {
            lat: Number(d.lat),
            lng: Number(d.lon),
            primary: parts[0] ?? "Unnamed place",
            secondary: parts.slice(1, 4).join(", ")
          };
        }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
        setResults(rows);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceSearchRef.current) clearTimeout(debounceSearchRef.current);
    };
  }, [query, visible]);

  // "Use my current location" — explicit GPS button. Skips Nominatim and
  // sets coords directly from Expo Location. If permission denied we just
  // surface the failure in the address label so the user knows.
  const useGps = async () => {
    setGpsBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLabel(t("map_picker.gps_denied"));
        return;
      }
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const c = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      setCenter(c);
      injectFlyTo(c, 17);
      setQuery("");
      setShowResults(false);
      Keyboard.dismiss();
    } catch {
      setLabel(t("map_picker.gps_error"));
    } finally {
      setGpsBusy(false);
    }
  };

  const injectFlyTo = (c: Coords, zoom?: number) => {
    if (!webRef.current) return;
    webRef.current.injectJavaScript(`window.jrMap && window.jrMap.flyTo(${c.lat}, ${c.lng}, ${zoom ?? 17}); true;`);
  };

  const onPickResult = (r: SearchResult) => {
    const c = { lat: r.lat, lng: r.lng };
    setCenter(c);
    injectFlyTo(c, 17);
    setQuery(r.primary);
    setShowResults(false);
    Keyboard.dismiss();
  };

  const headerTitle = mode === "pickup" ? t("map_picker.title_pickup") : t("map_picker.title_drop");
  const headerSub = mode === "pickup" ? t("map_picker.subtitle_pickup") : t("map_picker.subtitle_drop");
  const placeholder = mode === "pickup" ? t("map_picker.search_placeholder_pickup") : t("map_picker.search_placeholder_drop");
  const confirmLabel = mode === "pickup" ? t("map_picker.confirm_pickup") : t("map_picker.confirm_drop");
  const labelHeading = mode === "pickup" ? t("map_picker.selected_pickup") : t("map_picker.selected_drop");

  return (
    <Modal visible={visible} onRequestClose={onCancel} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <WebView
          ref={webRef}
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
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === "center" && typeof msg.lat === "number" && typeof msg.lng === "number") {
                setCenter({ lat: msg.lat, lng: msg.lng });
                // If user has been typing then starts to drag, clear the
                // results overlay so it doesn't sit on top of the map.
                if (showResults) setShowResults(false);
              }
            } catch { /* malformed payload */ }
          }}
        />

        {/* Fixed centre pin */}
        <View pointerEvents="none" style={styles.pinOverlay}>
          <View style={styles.pinShadow} />
          <View style={styles.pin}>
            <View style={styles.pinDot} />
          </View>
        </View>

        {!mapReady ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.primary} />
            <Text variant="small" tone="muted" style={{ marginTop: space.xs }}>
              {t("drop_picker.loading_map")}
            </Text>
          </View>
        ) : null}

        {/* Top floating block: header + search bar (always together so the
          * keyboard expands smoothly with the search). */}
        <View style={styles.topBlock}>
          <View style={styles.headerRow}>
            <Pressable onPress={onCancel} style={styles.headerBack} android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: true }}>
              <Text variant="heading" weight="bold" style={{ color: colors.textPrimary }}>←</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text variant="body" weight="bold">{headerTitle}</Text>
              <Text variant="tiny" tone="muted">{headerSub}</Text>
            </View>
          </View>

          {/* Search bar */}
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              testID="map-picker-search"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => { setQuery(""); setShowResults(false); }}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {/* "Use my current location" — quick GPS shortcut. */}
          <Pressable onPress={useGps} disabled={gpsBusy} style={styles.gpsRow} android_ripple={{ color: "rgba(229,50,43,0.10)" }}>
            <Text style={styles.gpsIcon}>📍</Text>
            <Text variant="small" weight="bold" tone="primary">
              {gpsBusy ? t("map_picker.gps_busy") : t("map_picker.use_current")}
            </Text>
          </Pressable>

          {/* Autocomplete results dropdown. ScrollView so we can show
            * 5-8 results without overflowing the screen. */}
          {showResults ? (
            <View style={styles.resultsBox}>
              {searching ? (
                <View style={styles.resultRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text variant="small" tone="muted" style={{ marginLeft: space.sm }}>
                    {t("map_picker.searching")}
                  </Text>
                </View>
              ) : results.length === 0 ? (
                <View style={styles.resultRow}>
                  <Text variant="small" tone="muted">{t("map_picker.no_results")}</Text>
                </View>
              ) : (
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }}>
                  {results.map((r, i) => (
                    <Pressable
                      key={`${r.lat}-${r.lng}-${i}`}
                      onPress={() => onPickResult(r)}
                      android_ripple={{ color: "rgba(0,0,0,0.04)" }}
                      style={styles.resultRow}
                    >
                      <Text style={styles.resultPin}>📍</Text>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" weight="semi" numberOfLines={1}>{r.primary}</Text>
                        {r.secondary ? (
                          <Text variant="tiny" tone="muted" numberOfLines={1}>{r.secondary}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}
        </View>

        {/* Bottom card — current address (reverse-geocoded) + confirm CTA. */}
        <View style={styles.bottomCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={styles.bottomPinIcon} />
            <View style={{ flex: 1 }}>
              <Text variant="tiny" tone="secondary" weight="bold">{labelHeading}</Text>
              <Text variant="body" weight="semi" numberOfLines={2}>
                {resolving ? `${label} …` : label}
              </Text>
            </View>
          </View>
          <Button
            label={confirmLabel}
            onPress={() => onConfirm({ lat: center.lat, lng: center.lng, address: label })}
            fullWidth
            size="lg"
            disabled={!mapReady}
            testID="map-picker-confirm"
          />
        </View>
      </View>
    </Modal>
  );
}

function buildHtml(initial: Coords, zoom: number): string {
  // Same Leaflet stack as MapEmbed v1.0.12 — HTML built once, subsequent
  // updates pushed in via injectJavaScript.
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
  setTimeout(postCenter, 50);

  // Exposed so the React side can tell the map to fly to a search result
  // or GPS fix without reloading the page.
  window.jrMap = {
    flyTo: function(lat, lng, zoomLevel) {
      map.flyTo([lat, lng], zoomLevel || 17, { duration: 0.7 });
    }
  };
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
  pinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(238, 242, 247, 0.85)"
  },
  topBlock: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    paddingTop: 48,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    gap: space.sm
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md
  },
  headerBack: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center"
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: space.sm
  },
  searchIcon: { fontSize: 14 },
  searchInput: {
    flex: 1,
    paddingVertical: 4,
    fontSize: 15,
    color: colors.textPrimary
  },
  gpsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 6,
    paddingHorizontal: space.sm,
    alignSelf: "flex-start"
  },
  gpsIcon: { fontSize: 14 },
  resultsBox: {
    backgroundColor: "#fff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 4,
    overflow: "hidden"
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.04)"
  },
  resultPin: { fontSize: 14 },
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
