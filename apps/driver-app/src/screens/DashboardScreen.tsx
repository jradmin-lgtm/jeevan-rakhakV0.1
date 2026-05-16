import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, RefreshControl, View } from "react-native";
import * as Location from "expo-location";
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  IconBadge,
  MapEmbed,
  Pill,
  PulseDot,
  Screen,
  Skeleton,
  StatusBadge,
  Text,
  colors,
  space,
  useFadeIn
} from "@jr/ui";
import { Booking, bookings as bookingsApi, clearToken, driver as driverApi, me } from "../api";
import { getSocket, disconnectSocket } from "../socket";

const DRIVER_DEFAULT = { lat: 28.6139, lng: 77.209 };

// Helper duplicated from TripScreen for self-containment.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function estimateEtaMin(km: number, avgKmh = 28, roadFactor = 1.4): number {
  return Math.max(1, Math.round(((km * roadFactor) / avgKmh) * 60));
}

type Props = {
  profile: any;
  onLogout: () => void;
  onTrip: (b: Booking) => void;
  onProfile: () => void;
  onEarnings: () => void;
};

export function DashboardScreen({ profile, onLogout, onTrip, onProfile, onEarnings }: Props) {
  const [available, setAvailable] = useState(profile?.status !== "OFFLINE");
  const [pending, setPending] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeTrip, setActiveTrip] = useState<Booking | null>(null);
  const [todayCompleted, setTodayCompleted] = useState(0);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const subscribed = useRef(false);
  const fade = useFadeIn();

  // Get driver location once on mount + every 20s so dashboard ETA stays fresh
  // without burning battery. Foreground permission only.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch {
        /* ignored */
      }
    })();
    const tick = async () => {
      try {
        const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (mounted) setMyPos({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      } catch {
        /* keep prior fix */
      }
    };
    void tick();
    const id = setInterval(tick, 20_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const ignore = (id: string) => setIgnored((prev) => new Set(prev).add(id));

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [pen, my] = await Promise.all([
        bookingsApi.pending().catch(() => ({ bookings: [] as Booking[] })),
        bookingsApi.mine().catch(() => ({ bookings: [] as Booking[] }))
      ]);
      setPending(pen.bookings);
      const live = my.bookings.find((b) =>
        ["ACCEPTED", "ARRIVED", "PICKED_UP"].includes(b.status)
      );
      setActiveTrip(live ?? null);
      setTodayCompleted(my.bookings.filter((b) => b.status === "COMPLETED").length);
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 8000);
    return () => clearInterval(id);
  }, [refresh]);

  // Subscribe to live booking offers via socket.
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!available || subscribed.current) return;
      const sock = await getSocket();
      sock.emit("driver:availability", { available: true, lat: DRIVER_DEFAULT.lat, lng: DRIVER_DEFAULT.lng });
      sock.on("booking:offered", (msg: any) => {
        if (cancel) return;
        bookingsApi.get(msg.bookingId).then((r) => {
          if (cancel) return;
          setPending((prev) => (prev.find((b) => b.id === r.booking.id) ? prev : [r.booking, ...prev]));
        }).catch(() => {});
      });
      subscribed.current = true;
    })();
    return () => { cancel = true; };
  }, [available]);

  const toggleAvailable = useCallback(async () => {
    const next = !available;
    setAvailable(next);
    try {
      await driverApi.setAvailability(next ? "AVAILABLE" : "OFFLINE", DRIVER_DEFAULT.lat, DRIVER_DEFAULT.lng);
      const sock = await getSocket();
      sock.emit("driver:availability", { available: next, lat: DRIVER_DEFAULT.lat, lng: DRIVER_DEFAULT.lng });
    } catch (e: any) {
      Alert.alert("Could not update", e?.message ?? "Try again.");
      setAvailable(!next);
    }
  }, [available]);

  const accept = async (b: Booking) => {
    try {
      const r = await bookingsApi.accept(b.id);
      onTrip(r.booking);
    } catch (e: any) {
      Alert.alert("Could not accept", e?.message ?? "Booking may have been taken.");
      void refresh();
    }
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <AppHeader
        title={`Hi${profile?.name ? `, ${String(profile.name).split(" ")[0]}` : ""}`}
        subtitle={profile?.vehicleNumber ?? "Welcome to Jeevan Rakshak"}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {available ? <PulseDot size={8} color={colors.success} rings={1} /> : null}
            <Pill
              label={available ? "ONLINE" : "OFFLINE"}
              color={available ? colors.success : colors.textMuted}
              bg={available ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.16)"}
            />
          </View>
        }
      />

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconBadge
              glyph={available ? "◉" : "○"}
              size={48}
              bg={available ? "rgba(16,185,129,0.12)" : "rgba(148,163,184,0.16)"}
              color={available ? colors.success : colors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text variant="heading">{available ? "You are receiving requests" : "You are offline"}</Text>
              <Text variant="small" tone="secondary">
                {available
                  ? "Stay near major intersections to maximise pickups."
                  : "Go online to start receiving bookings."}
              </Text>
            </View>
          </View>
          <Button
            label={available ? "Go offline" : "Go online"}
            onPress={toggleAvailable}
            variant={available ? "outline" : "primary"}
            fullWidth
            size="lg"
            testID="availability-toggle"
          />
        </View>
      </Card>

      {activeTrip ? (
        <Animated.View style={fade}>
          <Card style={{ borderColor: colors.primary, borderWidth: 1.5 }} onPress={() => onTrip(activeTrip)}>
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <PulseDot size={10} color={colors.primary} />
                  <Text variant="label" tone="secondary">ACTIVE TRIP</Text>
                </View>
                <StatusBadge status={activeTrip.status} />
              </View>
              <Text variant="heading">{prettyEmergency(activeTrip.emergencyType)}</Text>
              <Text variant="small" tone="secondary">{activeTrip.pickupAddress ?? `${activeTrip.pickupLat.toFixed(4)}, ${activeTrip.pickupLng.toFixed(4)}`}</Text>
              <Button label="Open trip" onPress={() => onTrip(activeTrip)} fullWidth />
            </View>
          </Card>
        </Animated.View>
      ) : null}

      <Card flat>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconBadge glyph="✓" size={36} bg="rgba(16,185,129,0.10)" color={colors.success} />
            <View>
              <Text variant="label" tone="secondary">TRIPS TODAY</Text>
              <Text variant="title">{todayCompleted}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="label" tone="secondary">RATING</Text>
              <Text variant="title">{(profile?.rating ?? 5).toFixed(1)}</Text>
            </View>
            <IconBadge glyph="★" size={36} bg="rgba(245,158,11,0.10)" color={colors.warning} />
          </View>
        </View>
      </Card>

      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="label" tone="secondary">INCOMING REQUESTS</Text>
          {available ? <PulseDot size={6} color={colors.primary} rings={1} /> : null}
        </View>
        {!loaded ? (
          <Card>
            <View style={{ gap: space.sm }}>
              <Skeleton width={140} height={10} />
              <Skeleton width="100%" height={20} />
              <Skeleton width="60%" height={14} />
              <Skeleton height={44} />
            </View>
          </Card>
        ) : available ? (
          (() => {
            const visible = pending.filter((b) => !ignored.has(b.id));
            if (visible.length === 0) {
              return (
                <Card flat>
                  <EmptyState title="No active requests" description="New SOS requests will appear here instantly." />
                </Card>
              );
            }
            return visible.map((b) => {
              const km = myPos ? haversineKm(myPos.lat, myPos.lng, b.pickupLat, b.pickupLng) : null;
              const eta = km != null ? estimateEtaMin(km) : null;
              return (
                <Animated.View key={b.id} style={fade}>
                  <Card padding="md">
                    <View style={{ gap: space.md }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                          <PulseDot size={8} color={colors.primary} rings={1} />
                          <Pill label={prettyEmergency(b.emergencyType)} />
                        </View>
                        <Text variant="small" tone="muted">{new Date(b.createdAt).toLocaleTimeString()}</Text>
                      </View>

                      <MapEmbed
                        pickup={{ lat: b.pickupLat, lng: b.pickupLng, label: "Patient" }}
                        driver={myPos ? { lat: myPos.lat, lng: myPos.lng, label: "You" } : null}
                        height={180}
                      />

                      <Text variant="heading">{b.pickupAddress ?? "Patient location"}</Text>
                      <Text variant="small" tone="secondary">
                        {b.dropAddress ? `Drop: ${b.dropAddress}` : "Drop hospital not specified yet"}
                      </Text>

                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View>
                          <Text variant="tiny" tone="secondary">Distance</Text>
                          <Text variant="body" weight="semi">
                            {km != null ? `${km.toFixed(1)} km` : "Locating you…"}
                          </Text>
                        </View>
                        <View>
                          <Text variant="tiny" tone="secondary">ETA to pickup</Text>
                          <Text variant="body" weight="semi">
                            {eta != null ? `~${eta} min` : "—"}
                          </Text>
                        </View>
                        <View>
                          <Text variant="tiny" tone="secondary">Payout</Text>
                          <Text variant="body" weight="bold" tone="primary">
                            ₹{b.fareEstimateInr ?? "—"}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: "row", gap: space.sm }}>
                        <View style={{ flex: 1 }}>
                          <Button label="Ignore" onPress={() => ignore(b.id)} variant="outline" fullWidth />
                        </View>
                        <View style={{ flex: 2 }}>
                          <Button label="Accept" onPress={() => accept(b)} fullWidth size="lg" testID={`accept-${b.id}`} />
                        </View>
                      </View>
                    </View>
                  </Card>
                </Animated.View>
              );
            });
          })()
        ) : (
          <Card flat>
            <EmptyState title="You're offline" description="Go online above to receive emergency requests." />
          </Card>
        )}
      </View>

      <Card flat>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">QUICK ACTIONS</Text>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Button label="My profile" variant="outline" onPress={onProfile} fullWidth testID="profile-cta" />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Earnings" variant="outline" onPress={onEarnings} fullWidth testID="earnings-cta" />
            </View>
          </View>
          <Button
            label="Sign out"
            variant="ghost"
            onPress={async () => {
              await clearToken();
              disconnectSocket();
              onLogout();
            }}
          />
        </View>
      </Card>
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
