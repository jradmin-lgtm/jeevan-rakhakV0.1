import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { AppHeader, Button, Card, Input, PulseDot, Screen, Text, colors, radius, space, OutOfServiceArea } from "@jr/ui";
import { bookings as bookingsApi, fares as faresApi, serviceArea as serviceAreaApi, FareQuote, EmergencyType, Booking } from "../api";
import { MapLocationPicker } from "./MapLocationPicker";
import { useT } from "../i18n";

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

// v1.0.15: emergency labels are now translation keys so the option list
// re-renders in Hindi when the locale flips mid-screen. Previously the
// labels were captured at module load time → option-select looked "broken"
// for Hindi users (they tapped the right tile but saw English copy that
// didn't match the language toggle).
const EMERGENCY_KEYS: { key: EmergencyType; labelKey: string; subKey: string; emoji: string }[] = [
  { key: "CARDIAC",                    labelKey: "emergency.cardiac.label",          subKey: "emergency.cardiac.sub",          emoji: "♥" },
  { key: "BREATHING_DISTRESS",         labelKey: "emergency.breathing.label",        subKey: "emergency.breathing.sub",        emoji: "≈" },
  { key: "ACCIDENT_TRAUMA",            labelKey: "emergency.accident.label",         subKey: "emergency.accident.sub",         emoji: "✚" },
  { key: "PREGNANCY_NEONATAL",         labelKey: "emergency.pregnancy.label",        subKey: "emergency.pregnancy.sub",        emoji: "✿" },
  { key: "GENERAL_CRITICAL_TRANSFER",  labelKey: "emergency.critical_transfer.label", subKey: "emergency.critical_transfer.sub", emoji: "→" }
];

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
  const [pickupAddress, setPickupAddress] = useState<string>("Current location");
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationNote, setLocationNote] = useState<string>(t("book.detecting_location"));
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
    setLocating(true);
    setLocationNote(t("book.detecting_location"));
    setPickupCoords(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLocationNote(t("book.location_permission_needed"));
        return;
      }
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
      setPickupCoords({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      setLocationNote(
        t("book.location_active")
          .replace("{lat}", String(fix.coords.latitude.toFixed(4)))
          .replace("{lng}", String(fix.coords.longitude.toFixed(4)))
          .replace("{accuracy}", String(Math.round(fix.coords.accuracy ?? 0)))
      );
    } catch {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          setPickupCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
          setLocationNote(t("book.location_last_known"));
          return;
        }
      } catch {
        /* ignored */
      }
      setLocationNote(t("book.location_failed"));
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void refreshLocation();
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
      .catch(() => {
        /* keep-last-good — server still gatekeeps on POST */
      });
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
        pickupAddress: "Current location",
        dropAddress: dropAddress || undefined,
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
    <Screen>
      <AppHeader title={t("home.book_card.title")} onBack={onCancel} />
      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("book.emergency_type_label")}</Text>
          <View style={{ gap: space.sm }}>
            {EMERGENCY_KEYS.map((e) => {
              const selected = type === e.key;
              return (
                <Pressable
                  key={e.key}
                  onPress={() => setType(e.key)}
                  android_ripple={{ color: "rgba(0,0,0,0.04)" }}
                  style={[
                    styles.tile,
                    selected ? { borderColor: colors.primary, backgroundColor: colors.primaryFaint } : null
                  ]}
                  testID={`emergency-${e.key}`}
                >
                  <View style={[styles.emoji, selected ? { backgroundColor: colors.primary } : null]}>
                    <Text variant="heading" style={{ color: selected ? colors.textInverse : colors.primary }}>
                      {e.emoji}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" weight="semi">{t(e.labelKey)}</Text>
                    <Text variant="small" tone="secondary">{t(e.subKey)}</Text>
                  </View>
                  <View style={[styles.radio, selected ? { borderColor: colors.primary, backgroundColor: colors.primary } : null]} />
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("book.pickup_location_label")}</Text>
          <View style={styles.pickupLockedRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                {!locating && pickupCoords ? <PulseDot size={8} color={colors.success} rings={1} /> : null}
                <Text variant="body" weight="semi" numberOfLines={2}>
                  {locating ? t("book.detecting_short") : pickupCoords ? pickupAddress : t("book.location_not_set")}
                </Text>
              </View>
              <Text variant="tiny" tone={locating ? "secondary" : "muted"}>
                {locationNote}
              </Text>
              <Text variant="tiny" tone="secondary">
                {t("book.location_share_note")}
              </Text>
            </View>
            <Button
              label={locating ? "…" : t("book.gps_button")}
              variant="ghost"
              onPress={refreshLocation}
              disabled={locating}
            />
          </View>
          {/* v1.0.13 revised: pickup is now editable via the map picker too.
            * Same UX as drop — search a place or pin manually. */}
          <Pressable
            onPress={() => setPickerMode("pickup")}
            android_ripple={{ color: "rgba(229,50,43,0.10)" }}
            style={styles.pinOnMapBtn}
            testID="open-pickup-picker"
          >
            <Text variant="small" weight="bold" tone="primary">
              📍 {t("map_picker.pickup_open_button")}
            </Text>
            <Text variant="tiny" tone="muted">
              {pickupCoords ? `${pickupCoords.lat.toFixed(4)}, ${pickupCoords.lng.toFixed(4)}` : t("map_picker.pickup_hint")}
            </Text>
          </Pressable>

          <View style={{ gap: space.xs }}>
            <Input
              label={t("book.drop_label")}
              value={dropAddress}
              onChangeText={(v) => {
                setDropAddress(v);
                // Clear coords if user is typing — they're picking a new
                // destination, the pin from the map no longer matches.
                if (dropCoords) setDropCoords(null);
              }}
              placeholder={t("book.drop_placeholder")}
            />
            <Pressable
              onPress={() => setPickerMode("drop")}
              android_ripple={{ color: "rgba(229,50,43,0.10)" }}
              style={styles.pinOnMapBtn}
              testID="open-drop-picker"
            >
              <Text variant="small" weight="bold" tone="primary">
                {dropCoords ? t("book.edit_pin_on_map") : `📍 ${t("drop_picker.open_button")}`}
              </Text>
              <Text variant="tiny" tone="muted">
                {dropCoords
                  ? t("book.exact_location_set").replace("{lat}", String(dropCoords.lat.toFixed(4))).replace("{lng}", String(dropCoords.lng.toFixed(4)))
                  : t("drop_picker.refine_hint")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <Card>
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
                  <Text variant="tiny" tone="muted">~{quote.etaMin} min</Text>
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

          {!quote || quote.distanceKm == null ? (
            <Text variant="tiny" tone="muted">
              {t("book.fare_no_drop_hint").replace("{rate}", String(quote?.perKmFareInr ?? 120)).replace("{fare}", String(quote?.baseFareInr ?? 300))}
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
              <Pressable onPress={() => { setCoupon(PILOT_COUPON); setCouponApplied(true); }}>
                <Text variant="small" tone="primary" style={{ textDecorationLine: "underline" }}>
                  {t("book.launch_offer_hint").replace("{code}", PILOT_COUPON)}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </Card>

      {err ? (
        <Card flat>
          <Text variant="small" tone="danger">{err}</Text>
        </Card>
      ) : null}

      <Button
        label={busy ? t("book.dispatching") : finalFare === 0 ? t("book.confirm_free") : t("book.confirm_amount").replace("{amount}", String(finalFare))}
        onPress={submit}
        loading={busy}
        disabled={!type || !pickupCoords}
        fullWidth
        size="lg"
        testID="confirm-booking"
      />
      <Text variant="tiny" tone="muted" align="center">
        {t("book.footer_note")}
      </Text>

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
            setPickupCoords({ lat: picked.lat, lng: picked.lng });
            setPickupAddress(picked.address);
            // We have an explicit pickup now — stop showing "Detecting…".
            setLocating(false);
            setLocationNote(`Set on map · ${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`);
          } else {
            setDropCoords({ lat: picked.lat, lng: picked.lng });
            // Only auto-fill the address field if the user hasn't typed
            // anything custom — never clobber their input.
            if (!dropAddress.trim()) setDropAddress(picked.address);
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
  pickupLockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border
  },
  emoji: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center"
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.borderStrong
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  fareTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm
  },
  struck: {
    textDecorationLine: "line-through",
    color: colors.textMuted
  },
  pinOnMapBtn: {
    marginTop: -space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryFaint,
    borderWidth: 1,
    borderColor: "rgba(229,50,43,0.15)"
  }
});
