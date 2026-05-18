import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { AppHeader, Button, Card, Input, PulseDot, Screen, Text, colors, radius, space } from "@jr/ui";
import { bookings as bookingsApi, fares as faresApi, FareQuote, EmergencyType, Booking } from "../api";
import { MapLocationPicker } from "./MapLocationPicker";
import { useT } from "../i18n";

const EMERGENCIES: { key: EmergencyType; label: string; sub: string; emoji: string }[] = [
  { key: "CARDIAC",                    label: "Cardiac",            sub: "Chest pain, heart attack",  emoji: "♥" },
  { key: "BREATHING_DISTRESS",         label: "Breathing distress", sub: "Asthma, oxygen support",    emoji: "≈" },
  { key: "ACCIDENT_TRAUMA",            label: "Accident / Trauma",  sub: "Road accident, injury",     emoji: "✚" },
  { key: "PREGNANCY_NEONATAL",         label: "Pregnancy",          sub: "Labour, neonatal",          emoji: "✿" },
  { key: "GENERAL_CRITICAL_TRANSFER",  label: "Critical transfer",  sub: "Hospital to hospital",      emoji: "→" }
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
  const [locationNote, setLocationNote] = useState<string>("Detecting your live location…");
  const [coupon, setCoupon] = useState<string>("");
  const [couponApplied, setCouponApplied] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // v1.0.13: server-computed fare quote. Recomputed whenever pickup/drop
  // coords change or the user applies/removes a coupon. `quoteBusy` lets
  // the UI show a subtle spinner instead of a flash of stale numbers.
  const [quote, setQuote] = useState<FareQuote | null>(null);
  const [quoteBusy, setQuoteBusy] = useState(false);

  const refreshLocation = useCallback(async () => {
    setLocating(true);
    setLocationNote("Detecting your live location…");
    setPickupCoords(null);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setLocationNote("Allow location access to book — we need it to send the ambulance to you.");
        return;
      }
      const fix = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High
      });
      setPickupCoords({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      setLocationNote(
        `Live location active · ${fix.coords.latitude.toFixed(4)}, ${fix.coords.longitude.toFixed(4)} (±${Math.round(fix.coords.accuracy ?? 0)}m)`
      );
    } catch {
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          setPickupCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
          setLocationNote("Using your last known location (GPS lock failed) — tap Refresh to retry.");
          return;
        }
      } catch {
        /* ignored */
      }
      setLocationNote("Couldn't detect location · tap Refresh, or call support to book by phone.");
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void refreshLocation();
  }, [refreshLocation]);

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
      setErr("That coupon isn't valid for this account.");
    }
  };

  const removeCoupon = () => {
    setCoupon("");
    setCouponApplied(false);
    setErr(null);
  };

  const submit = async () => {
    if (!type) return;
    if (!pickupCoords) return;
    setErr(null);
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
      setErr(e.message ?? "Could not create booking. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Book ambulance" onBack={onCancel} />
      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">EMERGENCY TYPE</Text>
          <View style={{ gap: space.sm }}>
            {EMERGENCIES.map((e) => {
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
                    <Text variant="body" weight="semi">{e.label}</Text>
                    <Text variant="small" tone="secondary">{e.sub}</Text>
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
          <Text variant="label" tone="secondary">PICKUP LOCATION</Text>
          <View style={styles.pickupLockedRow}>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                {!locating && pickupCoords ? <PulseDot size={8} color={colors.success} rings={1} /> : null}
                <Text variant="body" weight="semi" numberOfLines={2}>
                  {locating ? "Detecting…" : pickupCoords ? pickupAddress : "Location not set"}
                </Text>
              </View>
              <Text variant="tiny" tone={locating ? "secondary" : "muted"}>
                {locationNote}
              </Text>
              <Text variant="tiny" tone="secondary">
                Your live location is what we share with the ambulance team.
              </Text>
            </View>
            <Button
              label={locating ? "…" : "GPS"}
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
              label="Drop / hospital (optional)"
              value={dropAddress}
              onChangeText={(v) => {
                setDropAddress(v);
                // Clear coords if user is typing — they're picking a new
                // destination, the pin from the map no longer matches.
                if (dropCoords) setDropCoords(null);
              }}
              placeholder="Hospital or address"
            />
            <Pressable
              onPress={() => setPickerMode("drop")}
              android_ripple={{ color: "rgba(229,50,43,0.10)" }}
              style={styles.pinOnMapBtn}
              testID="open-drop-picker"
            >
              <Text variant="small" weight="bold" tone="primary">
                {dropCoords ? "📍 Edit pin on map" : `📍 ${t("drop_picker.open_button")}`}
              </Text>
              <Text variant="tiny" tone="muted">
                {dropCoords
                  ? `Exact location set · ${dropCoords.lat.toFixed(4)}, ${dropCoords.lng.toFixed(4)}`
                  : t("drop_picker.refine_hint")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="label" tone="secondary">FARE &amp; OFFERS</Text>
            {quoteBusy ? <Text variant="tiny" tone="muted">Calculating…</Text> : null}
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
                  Distance ({quote.distanceKm.toFixed(1)} km × ₹{quote.perKmFareInr})
                </Text>
                <Text variant="body" weight="semi">₹{distanceCharge}</Text>
              </View>
              {quote.multipliers.vehicleMult !== 1.0 ? (
                <View style={styles.fareRow}>
                  <Text variant="body" tone="secondary">
                    Vehicle ({quote.multipliers.vehicleType} × {quote.multipliers.vehicleMult.toFixed(2)})
                  </Text>
                  <Text variant="body" weight="semi">×{quote.multipliers.vehicleMult.toFixed(2)}</Text>
                </View>
              ) : null}
              {quote.multipliers.emergencyMult > 1.0 ? (
                <View style={styles.fareRow}>
                  <Text variant="body" tone="secondary">Priority dispatch</Text>
                  <Text variant="body" weight="semi">×{quote.multipliers.emergencyMult.toFixed(2)}</Text>
                </View>
              ) : null}
              {quote.multipliers.isNight ? (
                <View style={styles.fareRow}>
                  <Text variant="body" tone="secondary">Night surcharge (10pm–6am)</Text>
                  <Text variant="body" weight="semi">×{quote.multipliers.nightSurcharge.toFixed(2)}</Text>
                </View>
              ) : null}
              <View style={styles.fareRow}>
                <Text variant="body" tone="secondary">Subtotal</Text>
                <Text variant="body" weight="semi" style={couponApplied ? styles.struck : undefined}>
                  ₹{totalBeforeDiscount}
                </Text>
              </View>
              {quote.etaMin != null ? (
                <View style={styles.fareRow}>
                  <Text variant="tiny" tone="muted">⏱  Ambulance arrives in</Text>
                  <Text variant="tiny" tone="muted">~{quote.etaMin} min</Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.fareRow}>
              <Text variant="body" tone="secondary">Minimum fare estimate</Text>
              <Text variant="body" weight="semi">
                {quote ? `₹${quote.totalInr}` : <Text variant="body" tone="muted">…</Text>}
              </Text>
            </View>
          )}

          {!quote || quote.distanceKm == null ? (
            <Text variant="tiny" tone="muted">
              Pin a drop location to see the distance-based fare. Industry rates: ₹{quote?.perKmFareInr ?? 120}/km · minimum ₹{quote?.baseFareInr ?? 300}.
            </Text>
          ) : null}

          {couponApplied ? (
            <>
              <View style={styles.fareRow}>
                <Text variant="body" tone="success">Coupon {coupon}</Text>
                <Text variant="body" weight="semi" tone="success">− ₹{discount}</Text>
              </View>
              <View style={[styles.fareRow, styles.fareTotalRow]}>
                <Text variant="heading" weight="bold">Total payable</Text>
                <Text variant="heading" weight="bold" tone="success">₹{finalFare}</Text>
              </View>
              <Button label="Remove coupon" variant="ghost" onPress={removeCoupon} />
            </>
          ) : (
            <>
              <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Coupon code"
                    value={coupon}
                    onChangeText={setCoupon}
                    placeholder={PILOT_COUPON}
                    autoCapitalize="characters"
                  />
                </View>
                <Button label="Apply" onPress={applyCoupon} variant="outline" />
              </View>
              <Pressable onPress={() => { setCoupon(PILOT_COUPON); setCouponApplied(true); }}>
                <Text variant="small" tone="primary" style={{ textDecorationLine: "underline" }}>
                  Use launch offer: {PILOT_COUPON} (100% off)
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
        label={busy ? "Dispatching…" : finalFare === 0 ? "Confirm and dispatch (free)" : `Confirm and dispatch · ₹${finalFare}`}
        onPress={submit}
        loading={busy}
        disabled={!type || !pickupCoords}
        fullWidth
        size="lg"
        testID="confirm-booking"
      />
      <Text variant="tiny" tone="muted" align="center">
        Average response: 8–12 min · Cashless during launch offer
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
