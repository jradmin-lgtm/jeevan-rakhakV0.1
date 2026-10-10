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
import { Button, Text, buildPickerHtml, colors, radius, space } from "@jr/ui";
import { useT } from "../i18n";
import { places as placesApi } from "../api";
import { useMapConfig } from "../useMapConfig";

/** Search, GPS and manual pin selection share one confirmed coordinate/address pair. */
type Coords = { lat: number; lng: number };

type Props = {
  visible: boolean;
  mode: "pickup" | "drop";
  initialCenter: Coords | null;
  onCancel: () => void;
  onConfirm: (picked: { lat: number; lng: number; address: string }) => void;
};

type SearchResult = { source: "places"; placeId: string; primary: string; secondary: string };

// Groups a search's keystrokes with its eventual Place Details call for
// Google's session-based billing. Doesn't need to be cryptographically
// random, just unique-ish per search sequence.
function newSessionToken(): string {
  return `jr-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

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
  const [renderedProvider, setRenderedProvider] = useState<"google" | "osm" | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapRetry, setMapRetry] = useState(0);
  const webRef = useRef<WebView | null>(null);
  useEffect(() => {
    if (!visible || mapReady) return;
    const timer = setTimeout(() => setMapFailed(true), 20_000);
    return () => clearTimeout(timer);
  }, [visible, mapReady, mapRetry]);
  const retryMap = () => { setMapReady(false); setMapFailed(false); setRenderedProvider(null); setMapRetry(value => value + 1); };


  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [failedSelection, setFailedSelection] = useState<SearchResult | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const searchEpoch = useRef(0);
  const selectionEpoch = useRef(0);
  const addressCoords = useRef<Coords | null>(null);
  useEffect(() => {
    if (!visible) return;
    setCenter(startCenter);
    setLabel(t("drop_picker.detecting"));
    setQuery(""); setResults([]); setShowResults(false); setMapReady(false); setMapFailed(false); setRenderedProvider(null);
    setLocationError(null); setFailedSelection(null); addressCoords.current = null;
    searchEpoch.current += 1; selectionEpoch.current += 1;
  }, [visible, mode]);

  const debounceCenterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>(newSessionToken());
  // Set right after a Places selection resolves, holding the coords the
  // reverse-geocode-on-center-change effect below should skip (we already
  // have Google's own formatted address for that exact point : re-running
  // the server reverse-geocoder a moment later would just replace it with a
  // differently-worded string for the same location, a pointless flicker).
  const skipReverseGeocodeForRef = useRef<Coords | null>(null);

  // HTML is built ONCE per modal open. Subsequent coord changes go through
  // injectJavaScript(window.jrMap.flyTo) so the WebView never reloads.
  const mapCfg = useMapConfig();
  const html = useMemo(
    () => buildPickerHtml(mapRetry ? center : startCenter, startZoom, mapCfg),
    [visible, mapRetry, mapCfg.provider, mapCfg.googleBrowserKey]
  );

  useEffect(() => {
    if (!visible) return;
    const epoch = ++selectionEpoch.current;
    if (skipReverseGeocodeForRef.current?.lat === center.lat && skipReverseGeocodeForRef.current?.lng === center.lng) {
      skipReverseGeocodeForRef.current = null;
      return;
    }
    addressCoords.current = null;
    setFailedSelection(null);
    setResolving(true);
    const timer = setTimeout(async () => {
      try {
        const result = await placesApi.reverse(center.lat, center.lng);
        if (epoch !== selectionEpoch.current) return;
        setLabel(result.address); addressCoords.current = center; setLocationError(null);
      } catch (err) {
        if (epoch !== selectionEpoch.current) return;
        console.warn("[location-picker] reverse lookup failed", err);
        setLabel(`${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`);
        addressCoords.current = center;
        setLocationError(t("map_picker.address_unavailable"));
      } finally {
        if (epoch === selectionEpoch.current) setResolving(false);
      }
    }, 700);
    return () => { clearTimeout(timer); selectionEpoch.current += 1; };
  }, [center.lat, center.lng, visible]);

  useEffect(() => {
    const epoch = ++searchEpoch.current;
    if (visible && query.trim().length >= 2 && renderedProvider !== "google") { setResults([]); setShowResults(false); setSearching(false); setLocationError(t("map_picker.search_unavailable")); return; }
    if (!visible || query.trim().length < 2) { setResults([]); setShowResults(false); setSearching(false); return; }
    setResults([]); setSearching(true); setShowResults(true);
    const timer = setTimeout(async () => {
      try {
        const result = await placesApi.autocomplete(query.trim(), sessionTokenRef.current);
        if (epoch !== searchEpoch.current) return;
        if (!result.available) throw new Error("places_unavailable");
        setLocationError(null);
        setResults(result.predictions.map((p): SearchResult => {
          const parts = p.description.split(",").map((v) => v.trim()).filter(Boolean);
          return { source: "places", placeId: p.placeId, primary: parts[0] ?? p.description, secondary: parts.slice(1).join(", ") };
        }));
      } catch (err) {
        if (epoch !== searchEpoch.current) return;
        console.warn("[location-picker] search failed", err);
        setResults([]); setLocationError(t("map_picker.search_unavailable"));
      } finally { if (epoch === searchEpoch.current) setSearching(false); }
    }, 400);
    return () => { clearTimeout(timer); searchEpoch.current += 1; };
  }, [query, visible, renderedProvider]);

  // "Use my current location" : explicit GPS button. Skips Nominatim and
  // sets coords directly from Expo Location. If permission denied we just
  // surface the failure in the address label so the user knows.
  const useGps = async () => {
    const gpsEpoch = selectionEpoch.current;
    setGpsBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLabel(t("map_picker.gps_denied"));
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("GPS timed out")), 15_000); })
      ]).finally(() => { if (timer) clearTimeout(timer); });
      if (gpsEpoch !== selectionEpoch.current) return;
      const c = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      setCenter(c);
      injectFlyTo(c, 17);
      setQuery("");
      setShowResults(false);
      Keyboard.dismiss();
    } catch (error) {
      console.warn("[location-picker] GPS unavailable", error);
      setLocationError(t("map_picker.gps_error"));
    } finally {
      setGpsBusy(false);
    }
  };

  const injectFlyTo = (c: Coords, zoom?: number) => {
    if (!webRef.current) return;
    webRef.current.injectJavaScript(`window.jrMap && window.jrMap.flyTo(${c.lat}, ${c.lng}, ${zoom ?? 17}); true;`);
  };

  const onPickResult = async (r: SearchResult) => {
    searchEpoch.current += 1;
    setQuery("");
    setShowResults(false);
    Keyboard.dismiss();

    if (renderedProvider !== "google") { setLocationError(t("map_picker.search_unavailable")); return; }
    const epoch = ++selectionEpoch.current;
    setResolvingPlace(true);
    setFailedSelection(null);
    addressCoords.current = null;
    setLocationError(null);
    try {
      const details = await placesApi.details(r.placeId, sessionTokenRef.current);
      if (epoch !== selectionEpoch.current) return;
      sessionTokenRef.current = newSessionToken(); // this session is spent; fresh one for the next search
      if (details.available && Number.isFinite(details.lat) && Number.isFinite(details.lng) && Math.abs(details.lat!) <= 90 && Math.abs(details.lng!) <= 180) {
        const c = { lat: details.lat!, lng: details.lng! };
        skipReverseGeocodeForRef.current = c;
        setCenter(c);
        injectFlyTo(c, 17);
        if (!details.formattedAddress) throw new Error("address_missing");
        setLabel(details.formattedAddress);
        addressCoords.current = c;
        setResolving(false);
      } else throw new Error("place_coordinates_missing");
    } catch (err) {
      if (epoch !== selectionEpoch.current) return;
      setFailedSelection(r);
      console.warn("[location-picker] place selection failed", err);
      setLocationError(t("map_picker.selection_failed"));
      /* keep current pin position : no silent jump to a wrong place */
    } finally {
      setResolvingPlace(false);
    }
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
          key={`${mapCfg.provider}:${mapRetry}`}
          ref={webRef}
          originWhitelist={["*"]}
          source={{ html }}
          onLoadEnd={() => webRef.current?.injectJavaScript("if (window.__jrMapReady && window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({type: 'jr:map:ready',provider:window.__jrMapProvider})); true;")}
          style={styles.web}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          mixedContentMode="never"
          applicationNameForUserAgent="JeevanRakshak/2.2.1"
          setSupportMultipleWindows={false}
          onError={() => { setMapReady(false); setMapFailed(true); }}
          onRenderProcessGone={() => { setMapReady(false); setMapFailed(true); }}
          onContentProcessDidTerminate={() => { setMapReady(false); setMapFailed(true); }}
          onMessage={(event) => {
            try {
              const msg = JSON.parse(event.nativeEvent.data);
              if (msg.type === "jr:map:ready") { setMapReady(true); setMapFailed(false); if (msg.provider === "google" || msg.provider === "osm") setRenderedProvider(msg.provider); }
              if (msg.type === "jr:map:error") { setMapReady(false); setMapFailed(true); }
              if (msg.type === "center" && Number.isFinite(msg.lat) && Number.isFinite(msg.lng) && Math.abs(msg.lat) <= 90 && Math.abs(msg.lng) <= 180) {
                setCenter({ lat: msg.lat, lng: msg.lng });
                // If user has been typing then starts to drag, clear the
                // results overlay so it doesn't sit on top of the map.
                if (showResults) setShowResults(false);
              }
            } catch (error) { console.error("[map-picker] invalid renderer message", error); }
          }}
        />

        {/* Fixed centre pin */}
        <View pointerEvents="none" style={styles.pinOverlay}>
          <View style={styles.pinShadow} />
          <View style={styles.pin}>
            <View style={styles.pinDot} />
          </View>
        </View>

        {!mapReady && !mapFailed ? (
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
            <Pressable accessibilityRole="button" accessibilityLabel={t("map_picker.back")} onPress={onCancel} style={styles.headerBack} android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: true }}>
              <Text variant="heading" weight="bold" style={{ color: colors.textPrimary }}>←</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text variant="body" weight="bold">{headerTitle}</Text>
              <Text variant="tiny" tone="muted">{headerSub}</Text>
            </View>
          </View>

          {/* Search bar */}
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
              testID="map-picker-search"
            />
            {query.length > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t("map_picker.clear_search")} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }} onPress={() => { setQuery(""); setShowResults(false); }}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>

          {/* "Use my current location" : quick GPS shortcut. */}
          <Pressable onPress={useGps} disabled={gpsBusy} style={styles.gpsRow} android_ripple={{ color: "rgba(229,50,43,0.10)" }}>
            <Text style={styles.gpsIcon}>◉</Text>
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
                      key={r.placeId}
                      onPress={() => void onPickResult(r)}
                      android_ripple={{ color: "rgba(0,0,0,0.04)" }}
                      style={styles.resultRow}
                    >
                      <Text style={styles.resultPin}>◉</Text>
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

        {/* Bottom card : current address (reverse-geocoded) + confirm CTA. */}
        <View style={styles.bottomCard}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <View style={styles.bottomPinIcon} />
            <View style={{ flex: 1 }}>
              <Text variant="tiny" tone="secondary" weight="bold">{labelHeading}</Text>
              <Text variant="body" weight="semi" numberOfLines={2}>
                {resolving || resolvingPlace ? `${label} …` : label}
              </Text>
            </View>
          </View>
          {mapFailed ? <View style={{ gap: space.sm }}><Text variant="small" tone="danger">{t("map_picker.renderer_failed")}</Text><Button label={t("map_picker.retry_map")} variant="neutral" onPress={retryMap} /></View> : null}
          {locationError ? <Text variant="small" tone="danger" accessibilityRole="alert">{locationError}</Text> : null}
          {failedSelection ? <Button label={t("map_picker.retry_selection")} variant="neutral" onPress={() => void onPickResult(failedSelection)} testID="retry-place-selection" /> : null}
          <Button
            label={confirmLabel}
            onPress={() => onConfirm({ lat: center.lat, lng: center.lng, address: label })}
            fullWidth
            size="lg"
            disabled={!mapReady || resolvingPlace || resolving || searching || showResults || addressCoords.current?.lat !== center.lat || addressCoords.current?.lng !== center.lng}
            testID="map-picker-confirm"
          />
        </View>
      </View>
    </Modal>
  );
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
    width: 44, height: 44,
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
    minWidth: 0,
    minHeight: 44,
    paddingVertical: 4,
    fontSize: 15,
    color: colors.textPrimary
  },
  gpsRow: {
    minHeight: 44,
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
    minHeight: 52,
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
