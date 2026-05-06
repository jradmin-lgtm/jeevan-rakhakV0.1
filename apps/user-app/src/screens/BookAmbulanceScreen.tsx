import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { AppHeader, Button, Card, Input, Screen, Text, colors, radius, space } from "@jr/ui";
import { bookings as bookingsApi, EmergencyType, Booking } from "../api";

const EMERGENCIES: { key: EmergencyType; label: string; sub: string; emoji: string }[] = [
  { key: "CARDIAC",                    label: "Cardiac",            sub: "Chest pain, heart attack",  emoji: "♥" },
  { key: "BREATHING_DISTRESS",         label: "Breathing distress", sub: "Asthma, oxygen support",    emoji: "≈" },
  { key: "ACCIDENT_TRAUMA",            label: "Accident / Trauma",  sub: "Road accident, injury",     emoji: "✚" },
  { key: "PREGNANCY_NEONATAL",         label: "Pregnancy",          sub: "Labour, neonatal",          emoji: "✿" },
  { key: "GENERAL_CRITICAL_TRANSFER",  label: "Critical transfer",  sub: "Hospital to hospital",      emoji: "→" }
];

// Defaults to a Delhi sample location. Drop `expo-location` import + permission flow
// once team is ready (commented hook below).
const DEFAULT_PICKUP = { lat: 28.6139, lng: 77.209 };

type Props = {
  onCancel: () => void;
  onBooked: (b: Booking) => void;
};

export function BookAmbulanceScreen({ onCancel, onBooked }: Props) {
  const [type, setType] = useState<EmergencyType | null>(null);
  const [pickupAddress, setPickupAddress] = useState("Current location");
  const [dropAddress, setDropAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // To enable real GPS:
  //   pnpm expo install expo-location
  //   then: const loc = await Location.getCurrentPositionAsync({})
  //   pass loc.coords.latitude / longitude here.

  const submit = async () => {
    if (!type) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await bookingsApi.create({
        emergencyType: type,
        pickupLat: DEFAULT_PICKUP.lat,
        pickupLng: DEFAULT_PICKUP.lng,
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
          <Input
            label="Drop / hospital (optional)"
            value={dropAddress}
            onChangeText={setDropAddress}
            placeholder="Hospital or address"
          />
        </View>
      </Card>

      {err ? (
        <Card flat>
          <Text variant="small" tone="danger">{err}</Text>
        </Card>
      ) : null}

      <Button
        label={busy ? "Dispatching…" : "Confirm and dispatch"}
        onPress={submit}
        loading={busy}
        disabled={!type}
        fullWidth
        size="lg"
        testID="confirm-booking"
      />
      <Text variant="tiny" tone="muted" align="center">
        Average response: 8–12 min · Pay at drop or via UPI
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
  }
});
