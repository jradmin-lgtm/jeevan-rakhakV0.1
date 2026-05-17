import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import {
  AppHeader,
  Button,
  Card,
  ContactSupport,
  Pill,
  PulseDot,
  Screen,
  StatusBadge,
  Text,
  colors,
  space
} from "@jr/ui";
import { Booking, bookings as bookingsApi, me, clearToken } from "../api";

type Props = {
  profile: any;
  onLogout: () => void;
  onBook: () => void;
  onSos: () => void;
  onTrack: (b: Booking) => void;
  onProfile: () => void;
  onHistory: () => void;
};

// Matches server: only one active ride per user. Earlier value of 3 was
// changed in v1.0.11 after pilot testing showed users dispatching multiple
// ambulances unintentionally.
const MAX_ACTIVE_BOOKINGS = 1;

export function HomeScreen({ profile, onLogout, onBook, onSos, onTrack, onProfile, onHistory }: Props) {
  const [active, setActive] = useState<Booking | null>(null);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState<string | null>(profile?.name ?? null);
  const breathe = useRef(new Animated.Value(1)).current;

  // Subtle breathing animation on the central SOS button. Drives "this is
  // alive, tap me" affordance during an emergency without being so loud it
  // looks broken when the user is just looking at the home screen calmly.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1200, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [m, b] = await Promise.all([me.get().catch(() => null), bookingsApi.mine()]);
      if (m?.profile?.name) setName(m.profile.name);
      const liveList = b.bookings.filter((x) =>
        ["REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP"].includes(x.status)
      );
      setActiveCount(liveList.length);
      setActive(liveList[0] ?? null);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const greet = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <AppHeader
        title={`${greet}${name ? `, ${name.split(" ")[0]}` : ""}`}
        subtitle="What do you need today?"
        right={
          <Pill
            label="Profile"
            color={colors.accent}
            bg="rgba(30,94,255,0.10)"
            style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          />
        }
      />

      {active ? (
        <Card style={{ borderColor: colors.primary, borderWidth: 1.5 }} onPress={() => onTrack(active)}>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="label" tone="secondary">ACTIVE TRIP</Text>
              <StatusBadge status={active.status} />
            </View>
            <Text variant="heading">{prettyEmergency(active.emergencyType)}</Text>
            <Text variant="small" tone="secondary">
              Pickup: {active.pickupAddress ?? `${active.pickupLat.toFixed(4)}, ${active.pickupLng.toFixed(4)}`}
            </Text>
            <Button label="Open live tracking" onPress={() => onTrack(active)} fullWidth />
          </View>
        </Card>
      ) : (
        <>
          {/* v1.0.11 redesign — the SOS button is the primary visual focus.
            * Pilot testers reported the previous two-button layout buried the
            * emergency action. The big circle is unmistakable and works for
            * elderly / panicked / unfamiliar users. */}
          <View style={sosStyles.heroWrap}>
            <Text variant="title" weight="bold" align="center">Need help right now?</Text>
            <Text variant="small" tone="secondary" align="center" style={{ marginTop: 4 }}>
              Tap the red button for an emergency. The closest ambulance will be dispatched.
            </Text>

            <View style={sosStyles.ringWrap}>
              <PulseDot size={120} color={colors.danger} rings={3} />
              <Animated.View style={[sosStyles.bigButton, { transform: [{ scale: breathe }] }]}>
                <Pressable
                  onPress={onSos}
                  android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
                  style={sosStyles.bigButtonInner}
                  testID="sos-cta"
                  accessibilityRole="button"
                  accessibilityLabel="Emergency SOS — dispatch ambulance now"
                >
                  <Text variant="title" tone="inverse" weight="bold" style={{ fontSize: 48, letterSpacing: 3 }}>SOS</Text>
                  <Text variant="small" tone="inverse" style={{ opacity: 0.95, marginTop: 2 }}>Tap to dispatch</Text>
                </Pressable>
              </Animated.View>
            </View>

            <Pressable onPress={onBook} style={sosStyles.bookTile} testID="book-cta" android_ripple={{ color: "rgba(0,0,0,0.04)" }}>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="semi">Book ambulance</Text>
                <Text variant="tiny" tone="secondary">Non-emergency or scheduled · choose category</Text>
              </View>
              <Text variant="heading" tone="primary" weight="bold">→</Text>
            </Pressable>
          </View>
        </>
      )}

      {activeCount > 0 ? (
        <Card flat>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text variant="label" tone="secondary">ACTIVE RIDE</Text>
              <Text variant="body">In progress · book again after completion</Text>
            </View>
            <Pill label="ACTIVE" color={colors.danger} bg={colors.primaryFaint} />
          </View>
        </Card>
      ) : null}

      <Card flat>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">QUICK ACTIONS</Text>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Button label="Trip history" variant="outline" onPress={onHistory} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Medical profile" variant="outline" onPress={onProfile} fullWidth />
            </View>
          </View>
          <Button label="Sign out" variant="ghost" onPress={async () => { await clearToken(); onLogout(); }} />
        </View>
      </Card>

      <ContactSupport />

      <Text variant="tiny" tone="muted" align="center">
        Made with care for India&apos;s emergency response.
      </Text>
    </Screen>
  );
}

const sosStyles = StyleSheet.create({
  heroWrap: { gap: space.lg, paddingVertical: space.md, alignItems: "center" },
  ringWrap: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: space.sm
  },
  bigButton: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.85)",
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8
  },
  bigButtonInner: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  bookTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    width: "100%",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface
  }
});

export function prettyEmergency(t: string): string {
  switch (t) {
    case "ACCIDENT_TRAUMA": return "Accident / Trauma";
    case "CARDIAC": return "Cardiac";
    case "BREATHING_DISTRESS": return "Breathing distress";
    case "PREGNANCY_NEONATAL": return "Pregnancy / Neonatal";
    case "GENERAL_CRITICAL_TRANSFER": return "Critical transfer";
    default: return t;
  }
}
