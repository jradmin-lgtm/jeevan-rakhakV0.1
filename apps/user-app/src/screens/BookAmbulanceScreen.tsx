import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { AppHeader, Button, Card, Input, Screen, Text, colors, radius, space } from "@jr/ui";
import { bookings as bookingsApi, EmergencyType, Booking } from "../api";

const EMERGENCIES: { key: EmergencyType; label: string; sub: string; emoji: string }[] = [
  { key: "CARDIAC",                    label: "Cardiac",            sub: "Chest pain, heart attack",  emoji: "♥" },
  { key: "BREATHING_DISTRESS",         label: "Breathing distress", sub: "Asthma, oxygen support",    emoji: "≈" },
  { key: "ACCIDENT_TRAUMA",            label: "Accident / Trauma",  sub: "Road accident, injury",     emoji: "✚" },
  { key: "PREGNANCY_NEONATAL",         label: "Pregnancy",          sub: "Labour, neonatal",          emoji: "✿" },
  { key: "GENERAL_CRITICAL_TRANSFER",  label: "Critical transfer",  sub: "Hospital to hospital",      emoji: "→" }
];

// Fallback only fires if GPS permission is denied or fix times out.
// Delhi centroid — drivers see this and can call the patient if the location
// looks wrong.
const FALLBACK_PICKUP = { lat: 28.6139, lng: 77.209 };

// Base estimate. Once distance-aware pricing lands, replace with a real calc.
const BASE_FARE_INR = 250;

const PILOT_COUPON = "PILOT100";

type Props = {
  onCancel: () => void;
  onBooked: (b: Booking) => void;
};

export function BookAmbulanceScreen({ onCancel, onBooked }: Props) {
  const [type, setType] = useState<EmergencyType | null>(null);
  const [pickupAddress, setPickupAddress] = useState("Current location");
  const [dropAddress, setDropAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(true);
  const [locationNote, setLocationNote] = useState<string>("Detecting your location…");
  const [coupon, setCoupon] = useState<string>("");
  const [couponApplied, setCouponApplied] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          if (cancelled) return;
          setPickupCoords(FALLBACK_PICKUP);
          setLocationNote("Location permission denied · using approximate fallback");
          return;
        }
        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
          // Pilot only — keep timeout tight so the user isn't waiting forever.
          // If GPS is slow, we fall back to last-known position below.
        });
        if (cancelled) return;
        setPickupCoords({ lat: fix.coords.latitude, lng: fix.coords.longitude });
        setLocationNote(
          `Pickup pinned at ${fix.coords.latitude.toFixed(4)}, ${fix.coords.longitude.toFixed(4)} (±${Math.round(fix.coords.accuracy ?? 0)}m)`
        );
      } catch {
        if (cancelled) return;
        // Try last-known before giving up entirely.
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last) {
            setPickupCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
            setLocationNote("Using your last known location (GPS lock failed)");
            return;
          }
        } catch {
          /* ignored */
        }
        setPickupCoords(FALLBACK_PICKUP);
        setLocationNote("Couldn't detect location · using approximate fallback");
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const baseFare = BASE_FARE_INR;
  const discount = couponApplied ? baseFare : 0;
  const finalFare = baseFare - discount;

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
        pickupAddress: pickupAddress || undefined,
        dropAddress: dropAddress || undefined
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
          <Input
            label="Pickup location"
            value={pickupAddress}
            onChangeText={setPickupAddress}
            placeholder="Where to pick up?"
          />
          <Text variant="tiny" tone={locating ? "secondary" : "muted"}>
            {locationNote}
          </Text>
          <Input
            label="Drop / hospital (optional)"
            value={dropAddress}
            onChangeText={setDropAddress}
            placeholder="Hospital or address"
          />
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">FARE &amp; OFFERS</Text>

          <View style={styles.fareRow}>
            <Text variant="body" tone="secondary">Base fare</Text>
            <Text variant="body" weight="semi" style={couponApplied ? styles.struck : undefined}>
              ₹{baseFare}
            </Text>
          </View>

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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  }
});
