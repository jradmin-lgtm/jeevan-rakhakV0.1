import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import * as Location from "expo-location";
import { AppHeader, AmbulanceMark, Button, Card, Input, MapEmbed, MotionView, Screen, Text, colors, space, OutOfServiceArea } from "@jr/ui";
import { bookings as bookingsApi, fares as faresApi, serviceArea as serviceAreaApi, FareQuote, EmergencyType, Booking } from "../api";
import { PickupLandmark } from "./PickupLandmark";
import { MapLocationPicker } from "./MapLocationPicker";
import { BOOKING_CATEGORIES } from "../constants/emergencyCategories";
import { useT } from "../i18n";
import { useMapConfig } from "../useMapConfig";

// v2.0: local haversine for the client-side geofence pre-check. Kept local so
// the user app needs no @jr/utils workspace dependency; the server-side check
// in POST /bookings is the authoritative gate. Returns km between two points.
function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// v1.0.12: removed the Delhi-centroid fallback. If we couldn't get a real
// GPS fix we now leave pickupCoords null and surface a clear error — the
// Confirm button stays disabled, so we never dispatch an ambulance to a
// guessed Delhi address.

// v1.0.13: hardcoded BASE_FARE_INR removed. Fare is now fetched from the
// server's /fares/quote endpoint so admin + mobile + the booking row always
// show the same number. The user app no longer guesses pricing.
const PILOT_COUPON = "PILOT100";

type Props = {
  onCancel: () => void;
  onBooked: (b: Booking) => void;
};

export function BookAmbulanceScreen({ onCancel, onBooked }: Props) {
  const { t } = useT();
  const mapConfig = useMapConfig();
  const { width, fontScale } = useWindowDimensions();
  const stackedServices = width < 340 || fontScale > 1.25;
  const locationEpoch = useRef(0);
  const [pickupLandmark, setPickupLandmark] = useState("");
  const [fareExpanded, setFareExpanded] = useState(false);
  const [type, setType] = useState<EmergencyType | null>(null);
  // Pickup is GPS-only as of v1.0.11 — the team flagged that typing/backspacing
  // in the field was confusing because the dispatch uses coordinates, not the
  // displayed text. Now we lock the field, always use live GPS, and show a
  // refresh button if the user wants to re-snap to current position.
  const [dropAddress, setDropAddress] = useState("");
  // v1.0.13: optional precise drop coordinates from the map picker. When set,
  // the booking POST sends dropLat/dropLng so the driver gets an exact pin
  // (not just a hospital name to retype into Maps). User can still book with
  // text-only drop — coords are an opt-in refinement.
  const [dropCoords, setDropCoords] = useState<{ lat: number; lng: number } | null>(null);
  // v1.0.13 revised: a single picker handles both pickup and drop. The mode
  // toggles which the modal is currently editing; null means the modal is
  // closed. This lets us reuse the same component instance + state plumbing.
  const [pickerMode, setPickerMode] = useState<"pickup" | "drop" | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string>("");
  const [pickupIsGps, setPickupIsGps] = useState(true);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationNote, setLocationNote] = useState<string>("book.detecting_location");
  const [coupon, setCoupon] = useState<string>("");
  const [couponApplied, setCouponApplied] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // v1.0.13: server-computed fare quote. Recomputed whenever pickup/drop
  // coords change or the user applies/removes a coupon. `quoteBusy` lets
  // the UI show a subtle spinner instead of a flash of stale numbers.
  const [quote, setQuote] = useState<FareQuote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);
  // v1.3.x (geofence): public service-area config. When enabled, we block a
  // booking whose pickup falls outside radiusKm of the hospital center before
  // hitting the server (the server enforces the same rule as a fallback).
  // Best-effort fetch, keep-last-good — if the config can't be reached we
  // leave it null and let the server be the single gatekeeper.
  const [area, setArea] = useState<{
    enabled: boolean;
    centerLat: number;
    centerLng: number;
    radiusKm: number;
    cityName: string;
    hospitalName: string;
  } | null>(null);
  // v2.0 (geofence UX): when an out-of-area pickup is detected (client pre-check
  // or server 403), we surface the app-styled OutOfServiceArea sheet instead of
  // a native popup. Non-blocking when false.
  const [outOfAreaVisible, setOutOfAreaVisible] = useState(false);

  const refreshLocation = useCallback(async () => {
    const epoch = ++locationEpoch.current;
    setLocating(true);
    setLocationNote("book.detecting_location");
    setPickupCoords(null);
    setPickupLandmark("");
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (epoch !== locationEpoch.current) return;
      if (perm.status !== "granted") {
        setLocationNote("book.location_permission_needed");
        return;
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("GPS lookup timed out")), 15_000); })
      ]).finally(() => { if (timeout) clearTimeout(timeout); });
      if (epoch !== locationEpoch.current) return;
      setPickupCoords({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      setPickupIsGps(true);
      setLocationNote("book.gps_ready");
    } catch (error) {
      if (epoch !== locationEpoch.current) return;
      console.warn("Pickup GPS lookup failed", error);
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (epoch !== locationEpoch.current) return;
        if (last && Date.now() - last.timestamp < 120_000 && (last.coords.accuracy ?? Infinity) <= 200) {
          setPickupCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
          setPickupIsGps(true);
          setLocationNote("book.location_last_known");
          return;
        }
      } catch (error) {
        console.warn("Last known pickup unavailable", error);
      }
      setLocationNote("book.location_failed");
    } finally {
      if (epoch === locationEpoch.current) setLocating(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshLocation();
    return () => { locationEpoch.current += 1; };
  }, [refreshLocation]);

  // Pull the public service-area config once on mount. Mounted-guarded so we
  // don't setState after unmount; on failure we keep-last-good (null) and let
  // the server enforce the geofence on POST.
  useEffect(() => {
    let mounted = true;
    serviceAreaApi()
      .then((sa) => {
        if (!mounted) return;
        setArea({
          enabled: sa.enabled,
          centerLat: sa.centerLat,
          centerLng: sa.centerLng,
          radiusKm: sa.radiusKm,
          cityName: sa.cityName,
          hospitalName: sa.hospitalName
        });
      })
      .catch((error) => { console.warn("BookAmbulanceScreen.tsx.BookAmbulanceScreen failed", error instanceof Error ? error.message : String(error)); });
    return () => { mounted = false; };
  }, []);

  // Pull a fresh quote whenever pickup, drop, or coupon changes. Falls back
  // gracefully — if the server can't be reached we just don't show numbers
  // (the Confirm button stays enabled; server will compute on POST). Cheap
  // call, no debouncing needed because the inputs only change on user action.
  useEffect(() => {
    if (!pickupCoords) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    setQuoteBusy(true);
    faresApi
      .quote({
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        dropLat: dropCoords?.lat ?? null,
        dropLng: dropCoords?.lng ?? null,
        couponCode: couponApplied ? coupon : null,
        emergencyType: type
      })
      .then((q) => { if (!cancelled) setQuote(q); })
      .catch(() => { if (!cancelled) setQuote(null); })
      .finally(() => { if (!cancelled) setQuoteBusy(false); });
    return () => { cancelled = true; };
  }, [pickupCoords?.lat, pickupCoords?.lng, dropCoords?.lat, dropCoords?.lng, couponApplied, coupon, type]);

  const baseFare = quote?.baseFareInr ?? 0;
  const distanceCharge = quote?.distanceChargeInr ?? 0;
  const totalBeforeDiscount = quote?.totalInr ?? 0;
  const discount = quote?.coupon?.discountInr ?? 0;
  const finalFare = quote?.coupon?.payableInr ?? totalBeforeDiscount;

  const applyCoupon = () => {
    setErr(null);
    const code = coupon.trim().toUpperCase();
    if (!code) {
      // Empty input — auto-apply the pilot coupon so the user doesn't have to type.
      setCoupon(PILOT_COUPON);
      setCouponApplied(true);
      return;
    }
    if (code === PILOT_COUPON) {
      setCoupon(PILOT_COUPON);
      setCouponApplied(true);
    } else {
      setErr(t("book.coupon_invalid"));
    }
  };

  const removeCoupon = () => {
    setCoupon("");
    setCouponApplied(false);
    setErr(null);
  };

  // v2.0 (geofence UX): shared handler for an out-of-area pickup, so the client
  // pre-check and the server-fallback path surface the exact same UI. We now
  // open the app-styled OutOfServiceArea sheet (primary UI) plus a brief inline
  // error for context, instead of a native dialog.alert popup.
  const showOutOfArea = () => {
    const city = area?.cityName ?? "Bareilly";
    setErr(t("book.out_of_area_error").replace("{city}", city));
    setOutOfAreaVisible(true);
  };

  const submit = async () => {
    if (!type) return;
    if (!pickupCoords) return;
    setErr(null);
    if (dropAddress.trim() && !dropCoords) { setErr(t("book.drop_pin_required")); setPickerMode("drop"); return; }
    // Client-side geofence guard. When the service area is enabled and we have
    // a real pickup fix, block here if the pickup is beyond radiusKm of the
    // hospital center — saves a round-trip and gives instant feedback. The
    // server runs the same check, so this can't be bypassed by skipping it.
    if (area?.enabled && pickupCoords) {
      const distKm = haversineDistanceKm(
        pickupCoords.lat,
        pickupCoords.lng,
        area.centerLat,
        area.centerLng
      );
      if (distKm > area.radiusKm) {
        showOutOfArea();
        return;
      }
    }
    setBusy(true);
    try {
      const r = await bookingsApi.create({
        emergencyType: type,
        pickupLat: pickupCoords.lat,
        pickupLng: pickupCoords.lng,
        // Server will reverse-geocode if needed; we just send "Current location"
        // as a stable label so admin doesn't see an empty pickup string.
        pickupAddress: pickupIsGps ? t("book.current_location") : pickupAddress,
        ...(pickupLandmark.trim() ? { pickupLandmark: pickupLandmark.trim() } : {}),
        dropAddress: dropCoords ? dropAddress : undefined,
        dropLat: dropCoords?.lat,
        dropLng: dropCoords?.lng,
        couponCode: couponApplied ? coupon : undefined
      });
      onBooked(r.booking);
    } catch (e: any) {
      // Server-side geofence fallback: the booking handler rejects an
      // out-of-area pickup with error/code "out_of_service_area". Surface the
      // same in-app message as the client pre-check, not a generic failure.
      const code = String(e?.message ?? e?.details?.error ?? e?.details?.code ?? "");
      if (code === "out_of_service_area" || code.includes("out_of_service_area")) {
        showOutOfArea();
      } else {
        setErr(e.message ?? t("book.create_error"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      bg={colors.surface}
      header={<AppHeader title={t("home.book_card.title")} onBack={onCancel} />}
      footer={
        <View style={{ gap: space.sm }}>
          {err ? <Text variant="small" tone="danger" accessibilityRole="alert">{err}</Text> : null}
          <View style={styles.fareRow}>
            <Text variant="small" tone="secondary">{t("book.estimate_label")}</Text>
            <Text variant="heading" weight="bold">
              {quoteBusy ? t("book.calculating") : quote ? `₹${finalFare}` : t("book.estimate_pending")}
            </Text>
          </View>
          <Button
            label={busy ? t("book.dispatching") : t("book.request_ambulance")}
            onPress={submit}
            loading={busy}
            disabled={!type || !pickupCoords || (pickupLandmark.trim().length > 0 && pickupLandmark.trim().length < 2)}
            style={{ backgroundColor: colors.textPrimary, borderRadius: 14 }}
            fullWidth size="lg" testID="confirm-booking"
          />
          <Text variant="tiny" tone="secondary" align="center">
            {!type ? t("book.choose_type_hint") : !pickupCoords ? t("book.choose_pickup_hint") : t("book.footer_note")}
          </Text>
        </View>
      }
    >
      {pickupCoords ? <View style={styles.mapPreview}>
        <MapEmbed pickup={{ ...pickupCoords, label: t("book.pickup_short") }} drop={dropCoords ? { ...dropCoords, label: dropAddress } : null} mapConfig={mapConfig} height={166} />
      </View> : null}
      <View style={[styles.routePanel, pickupCoords ? { marginTop: -28 } : null]}>
        <View style={styles.locationRow}>
          <View style={styles.pickupDot} />
          <Pressable accessibilityRole="button" onPress={() => setPickerMode("pickup")} style={styles.locationMain} testID="open-pickup-picker">
            <Text variant="tiny" tone="secondary">{t("book.pickup_short")}</Text>
            <Text variant="body" weight="semi" numberOfLines={2}>
              {locating ? t("book.detecting_short") : pickupCoords ? (pickupIsGps ? t("book.current_location") : pickupAddress) : t("book.location_not_set")}
            </Text>
            {!pickupCoords || locating ? <Text variant="small" tone={locating ? "secondary" : "danger"}>{t(locationNote)}</Text> : null}
          </Pressable>
          <Button label={t("book.gps_button")} variant="ghost" onPress={refreshLocation} loading={locating} testID="refresh-pickup-gps" />
        </View>
        <View style={styles.routeDivider} />
        <View style={styles.locationRow}>
          <View style={styles.dropDot} />
          <Pressable accessibilityRole="button" onPress={() => setPickerMode("drop")} style={styles.locationMain} testID="open-drop-picker">
            <Text variant="tiny" tone="secondary">{t("book.drop_label")}</Text>
            <Text variant="body" weight="semi" numberOfLines={2}>{dropAddress || t("book.drop_placeholder")}</Text>

          </Pressable>
          {dropCoords ? <Button label={t("book.clear_drop")} variant="ghost" onPress={() => { setDropCoords(null); setDropAddress(""); }} testID="clear-drop" /> : null}
        </View>
      </View>
      <View style={{ gap: space.sm }}>
        <Text variant="heading">{t("book.emergency_type_label")}</Text>
        <View style={[styles.serviceList, stackedServices && { flexDirection: "column" }]}>
          {BOOKING_CATEGORIES.map((e) => {
            const selected = type === e.key;
            return (
              <Pressable key={e.key} accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected}
                accessibilityLabel={`${t(e.labelKey)}. ${t(e.subKey)}`} onPress={() => setType(e.key)} testID={`emergency-${e.key}`}
                style={({ pressed }) => [styles.tile, stackedServices && { flexDirection: "row", flex: 0 }, selected ? styles.selectedTile : null, pressed ? { transform: [{ scale: 0.97 }] } : null]}>
                <AmbulanceMark size={58} />
                <View style={{ minWidth: 0, flexShrink: 1, alignSelf: "stretch" }}>
                  <Text variant="small" weight="bold" align={stackedServices ? "left" : "center"}>{t(`book.service.${e.key}`)}</Text>
                </View>
                <View style={[styles.radio, selected ? { borderColor: colors.primary, backgroundColor: colors.primary } : null]}>
                  {selected ? <Text variant="tiny" tone="inverse" weight="bold">✓</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        {type ? <MotionView changeKey={type}><Text variant="small" tone="secondary">{t(BOOKING_CATEGORIES.find(item => item.key === type)!.subKey)}</Text></MotionView> : null}
      </View>

      {pickupLandmark.trim().length === 1 ? <Text variant="small" tone="danger">{t("landmark.invalid")}</Text> : null}
      {pickupCoords ? <PickupLandmark key={`${pickupCoords.lat},${pickupCoords.lng}`} lat={pickupCoords.lat} lng={pickupCoords.lng} value={pickupLandmark} onChange={setPickupLandmark} /> : null}

      {!couponApplied ? <Pressable accessibilityRole="button" onPress={() => { setCoupon(PILOT_COUPON); setCouponApplied(true); }} style={{ minHeight: 44, justifyContent: "center" }}>
        <Text variant="small" tone="primary" weight="semi">{t("book.launch_offer_hint").replace("{code}", PILOT_COUPON)}</Text>
      </Pressable> : <Text variant="small" tone="success">{t("book.coupon_applied_label").replace("{code}", coupon)}</Text>}

      <Button label={t(fareExpanded ? "book.hide_fare_details" : "book.fare_details")} variant="outline" onPress={() => setFareExpanded(open => !open)} testID="toggle-fare-details" />
      {fareExpanded ? <Card flat>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="label" tone="secondary">{t("book.fare_offers_label")}</Text>
            {quoteBusy ? <Text variant="tiny" tone="muted">{t("book.calculating")}</Text> : null}
          </View>

          {/* v1.0.13 revised: dynamic fare with explicit multipliers.
            * Distance × per-km is the raw line; surcharges (vehicle type,
            * emergency severity, night) are shown so the patient
            * understands what they're paying for and why.
            *
            * Industry standard: BLS BLS=1.0×, ALS=1.5×, ICU=2.0×; Cardiac/
            * Trauma trips +20%; Pregnancy +10%; night (22:00–06:00) +25%.
            * All server-driven so admin and patient see identical numbers. */}
          {quote && quote.distanceKm != null ? (
            <>
              <View style={styles.fareRow}>
                <Text variant="body" tone="secondary">
                  {t("book.fare_distance").replace("{km}", String(quote.distanceKm.toFixed(1))).replace("{rate}", String(quote.perKmFareInr))}
                </Text>
                <Text variant="body" weight="semi">₹{distanceCharge}</Text>
              </View>
              {quote.multipliers.vehicleMult !== 1.0 ? (
                <View style={styles.fareRow}>
                  <Text variant="body" tone="secondary">
                    {t("book.fare_vehicle").replace("{type}", String(quote.multipliers.vehicleType)).replace("{mult}", String(quote.multipliers.vehicleMult.toFixed(2)))}
                  </Text>
                  <Text variant="body" weight="semi">×{quote.multipliers.vehicleMult.toFixed(2)}</Text>
                </View>
              ) : null}
              {quote.multipliers.emergencyMult > 1.0 ? (
                <View style={styles.fareRow}>
                  <Text variant="body" tone="secondary">{t("book.fare_priority")}</Text>
                  <Text variant="body" weight="semi">×{quote.multipliers.emergencyMult.toFixed(2)}</Text>
                </View>
              ) : null}
              {quote.multipliers.isNight ? (
                <View style={styles.fareRow}>
                  <Text variant="body" tone="secondary">{t("book.fare_night_surcharge")}</Text>
                  <Text variant="body" weight="semi">×{quote.multipliers.nightSurcharge.toFixed(2)}</Text>
                </View>
              ) : null}
              <View style={styles.fareRow}>
                <Text variant="body" tone="secondary">{t("book.fare_subtotal")}</Text>
                <Text variant="body" weight="semi" style={couponApplied ? styles.struck : undefined}>
                  ₹{totalBeforeDiscount}
                </Text>
              </View>
              {quote.etaMin != null ? (
                <View style={styles.fareRow}>
                  <Text variant="tiny" tone="muted">{t("book.fare_eta_label")}</Text>
                  {/* 2026-08-17: prefer the real-traffic liveEtaMin (Google
                      Directions) when the backend has it; etaMin (static
                      formula) is the fallback and is always present. */}
                  <Text variant="tiny" tone="muted">~{quote.liveEtaMin ?? quote.etaMin} min</Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.fareRow}>
              <Text variant="body" tone="secondary">{t("book.fare_minimum_estimate")}</Text>
              <Text variant="body" weight="semi">
                {quote ? `₹${quote.totalInr}` : <Text variant="body" tone="muted">…</Text>}
              </Text>
            </View>
          )}

          {quote && quote.distanceKm == null ? (
            <Text variant="tiny" tone="muted">
              {t("book.fare_no_drop_hint").replace("{rate}", String(quote.perKmFareInr)).replace("{fare}", String(quote.baseFareInr))}
            </Text>
          ) : null}

          {couponApplied ? (
            <>
              <View style={styles.fareRow}>
                <Text variant="body" tone="success">{t("book.coupon_applied_label").replace("{code}", coupon)}</Text>
                <Text variant="body" weight="semi" tone="success">− ₹{discount}</Text>
              </View>
              <View style={[styles.fareRow, styles.fareTotalRow]}>
                <Text variant="heading" weight="bold">{t("book.total_payable")}</Text>
                <Text variant="heading" weight="bold" tone="success">₹{finalFare}</Text>
              </View>
              <Button label={t("book.remove_coupon")} variant="ghost" onPress={removeCoupon} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label={t("book.coupon_code_label")}
                    value={coupon}
                    onChangeText={setCoupon}
                    placeholder={PILOT_COUPON}
                    autoCapitalize="characters"
                  />
                </View>
                <Button label={t("book.apply")} onPress={applyCoupon} variant="outline" />
              </View>

            </>
          )}
        </View>
      </Card> : null}

      {/* v1.0.13 revised: one picker handles both pickup + drop. The mode
        * is tracked in `pickerMode` (null = closed, "pickup" / "drop" = open).
        * Centre is the current pin for that mode, or the other pin as a
        * reasonable fallback, or nothing (the picker falls back to country-
        * wide view + search-first). */}
      <MapLocationPicker
        visible={pickerMode !== null}
        mode={pickerMode ?? "drop"}
        initialCenter={
          pickerMode === "pickup"
            ? (pickupCoords ?? dropCoords ?? null)
            : (dropCoords ?? pickupCoords ?? null)
        }
        onCancel={() => setPickerMode(null)}
        onConfirm={(picked) => {
          if (pickerMode === "pickup") {
            locationEpoch.current += 1;
            setPickupLandmark("");
            setPickupCoords({ lat: picked.lat, lng: picked.lng });
            setPickupAddress(picked.address);
            setPickupIsGps(false);
            // We have an explicit pickup now — stop showing "Detecting…".
            setLocating(false);
            setLocationNote("book.pin_confirmed");
          } else {
            setDropCoords({ lat: picked.lat, lng: picked.lng });
            // Only auto-fill the address field if the user hasn't typed
            // anything custom — never clobber their input.
            setDropAddress(picked.address);
          }
          setPickerMode(null);
        }}
      />

      {/* v2.0 (geofence UX): app-styled out-of-area sheet. Non-blocking when
        * not visible; opened by showOutOfArea() from the client pre-check and
        * the server 403 catch. Normal booking path → emergency={false}. */}
      <OutOfServiceArea
        visible={outOfAreaVisible}
        onClose={() => setOutOfAreaVisible(false)}
        cityName={area?.cityName ?? "Bareilly"}
        hospitalName={area?.hospitalName}
        radiusKm={area?.radiusKm}
        emergency={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  mapPreview: { marginHorizontal: -16, marginTop: -16, paddingBottom: 12 },
  routePanel: { backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, elevation: 2, shadowColor: colors.textPrimary, shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  locationRow: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 2 },
  locationMain: { flex: 1, minWidth: 0, gap: 3, paddingVertical: 8, minHeight: 56 },
  pickupDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textPrimary },
  dropDot: { width: 10, height: 10, borderRadius: 2, borderWidth: 2, borderColor: colors.primary },
  routeDivider: { height: 1, marginLeft: 22, backgroundColor: colors.border },
  serviceList: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 9, paddingVertical: 16, paddingHorizontal: 8, minHeight: 114, borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.bg },
  selectedTile: { backgroundColor: colors.primaryFaint, borderColor: colors.primary },
  radio: { position: "absolute", right: 7, top: 7, width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  fareRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  fareTotalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  struck: { textDecorationLine: "line-through", color: colors.textSecondary }
});
