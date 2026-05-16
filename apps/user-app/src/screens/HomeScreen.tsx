import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, View } from "react-native";
import {
  AppHeader,
  Button,
  Card,
  ContactSupport,
  Pill,
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

const MAX_ACTIVE_BOOKINGS = 3;

export function HomeScreen({ profile, onLogout, onBook, onSos, onTrack, onProfile, onHistory }: Props) {
  const [active, setActive] = useState<Booking | null>(null);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [activeList, setActiveList] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState<string | null>(profile?.name ?? null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [m, b] = await Promise.all([me.get().catch(() => null), bookingsApi.mine()]);
      if (m?.profile?.name) setName(m.profile.name);
      const liveList = b.bookings.filter((x) =>
        ["REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP"].includes(x.status)
      );
      setActiveList(liveList);
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
        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="heading">Need an ambulance now?</Text>
            <Text variant="body" tone="secondary">
              Book the nearest ambulance in two taps. We&apos;ll dispatch the closest available driver.
            </Text>
            <Button label="Book ambulance" onPress={onBook} fullWidth testID="book-cta" />
            <Button label="Emergency SOS" variant="danger" onPress={onSos} fullWidth />
          </View>
        </Card>
      )}

      {activeCount > 0 ? (
        <Card flat>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text variant="label" tone="secondary">ACTIVE RIDES</Text>
              <Text variant="body">
                {activeCount} of {MAX_ACTIVE_BOOKINGS}
                {activeCount >= MAX_ACTIVE_BOOKINGS ? " · limit reached" : ""}
              </Text>
            </View>
            {activeCount >= MAX_ACTIVE_BOOKINGS ? (
              <Pill label="MAX" color={colors.danger} bg={colors.primaryFaint} />
            ) : (
              <Pill
                label={`${MAX_ACTIVE_BOOKINGS - activeCount} more allowed`}
                color={colors.success}
                bg="#E8F8F1"
              />
            )}
          </View>
          {activeCount >= MAX_ACTIVE_BOOKINGS ? (
            <Text variant="tiny" tone="muted" style={{ marginTop: space.xs }}>
              Complete or cancel an active ride before booking a new one.
            </Text>
          ) : null}
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
