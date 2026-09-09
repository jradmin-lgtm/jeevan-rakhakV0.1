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
 * 2026-08-17: search now tries Google Places Autocomplete first (via the
 * backend proxy — the API key never reaches this app), falling back to the
 * original free Nominatim (OSM) search whenever Places is unavailable
 * (backend flag off, or any Google-side failure) — search must never break
 * just because a third-party API had a bad moment. A Places result only
 * carries a placeId; picking one resolves lat/lng via a single Place
 * Details call (the only billed step — never fired per keystroke).
 * Nominatim remains bound to India via `countrycodes=in`, debounced 400ms.
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

type SearchResult =
  | { source: "nominatim"; lat: number; lng: number; primary: string; secondary: string }
  | { source: "places"; placeId: string; primary: string; secondary: string };

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
  const webRef = useRef<WebView | null>(null);

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);

  const debounceCenterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>(newSessionToken());
  // Set right after a Places selection resolves, holding the coords the
  // reverse-geocode-on-center-change effect below should skip (we already
  // have Google's own formatted address for that exact point — re-running
  // Nominatim reverse-geocode a moment later would just replace it with a
  // differently-worded string for the same location, a pointless flicker).
  const skipReverseGeocodeForRef = useRef<Coords | null>(null);

  // HTML is built ONCE per modal open. Subsequent coord changes go through
  // injectJavaScript(window.jrMap.flyTo) so the WebView never reloads.
  const mapCfg = useMapConfig();
  const html = useMemo(
    () => buildPickerHtml(startCenter, startZoom, mapCfg),
    [visible, mapCfg.provider, mapCfg.googleBrowserKey]
  );

  // Reverse-geocode whatever's at the centre of the map. Debounced so a
  // long pan doesn't fire one request per frame.
  useEffect(() => {
    if (!visible) return;
    const skip = skipReverseGeocodeForRef.current;
    if (skip && skip.lat === center.lat && skip.lng === center.lng) {
      skipReverseGeocodeForRef.current = null;
      return;
    }
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

  const searchNominatim = async (q: string): Promise<SearchResult[]> => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&countrycodes=in&limit=8&addressdetails=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_UA, "Accept-Language": "en-IN,en;q=0.8" }
    });
    if (!res.ok) throw new Error("nominatim_search");
    const data: any[] = await res.json();
    type NominatimResult = Extract<SearchResult, { source: "nominatim" }>;
    return (Array.isArray(data) ? data : [])
      .map((d): NominatimResult => {
        const parts = String(d.display_name ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
        return {
          source: "nominatim",
          lat: Number(d.lat),
          lng: Number(d.lon),
          primary: parts[0] ?? t("map_picker.unnamed_place"),
          secondary: parts.slice(1, 4).join(", ")
        };
      })
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  };

  // Autocomplete search. Empty query => hide the results list. Debounced
  // 400ms. Tries Google Places first; falls back to Nominatim whenever
  // Places is unavailable (flag off or a Google-side failure) — search must
  // never break just because a third-party API had a bad moment.
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
      let placesOk = false;
      try {
        const placesRes = await placesApi.autocomplete(q, sessionTokenRef.current);
        if (placesRes.available) {
          placesOk = true;
          setResults(
            placesRes.predictions.map((p): SearchResult => {
              const parts = p.description.split(",").map((s) => s.trim()).filter(Boolean);
              return {
                source: "places",
                placeId: p.placeId,
                primary: parts[0] ?? p.description,
                secondary: parts.slice(1, 4).join(", ")
              };
            })
          );
        }
      } catch {
        /* fall through to Nominatim below */
      }
      if (!placesOk) {
        try {
          setResults(await searchNominatim(q));
        } catch {
          setResults([]);
        }
      }
      setSearching(false);
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

  const onPickResult = async (r: SearchResult) => {
    setQuery(r.primary);
    setShowResults(false);
    Keyboard.dismiss();

    if (r.source === "nominatim") {
      const c = { lat: r.lat, lng: r.lng };
      setCenter(c);
      injectFlyTo(c, 17);
      return;
    }

    // Places result — only carries a placeId; resolve real coords via one
    // Details call (the only billed step, fired once per selection here,
    // never per keystroke). Falls back to leaving the pin where it was if
    // the lookup fails — better than silently jumping nowhere.
    setResolvingPlace(true);
    try {
      const details = await placesApi.details(r.placeId, sessionTokenRef.current);
      sessionTokenRef.current = newSessionToken(); // this session is spent; fresh one for the next search
      if (details.available && details.lat != null && details.lng != null) {
        const c = { lat: details.lat, lng: details.lng };
        skipReverseGeocodeForRef.current = c;
        setCenter(c);
        injectFlyTo(c, 17);
        if (details.formattedAddress) setLabel(details.formattedAddress);
      }
    } catch {
      /* keep current pin position — no silent jump to a wrong place */
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
                      key={r.source === "places" ? r.placeId : `${r.lat}-${r.lng}-${i}`}
                      onPress={() => void onPickResult(r)}
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
                {resolving || resolvingPlace ? `${label} …` : label}
              </Text>
            </View>
          </View>
          <Button
            label={confirmLabel}
            onPress={() => onConfirm({ lat: center.lat, lng: center.lng, address: label })}
            fullWidth
            size="lg"
            disabled={!mapReady || resolvingPlace}
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
