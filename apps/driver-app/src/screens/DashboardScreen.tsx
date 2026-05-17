import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Pressable, RefreshControl, View } from "react-native";
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

// v1.0.12: removed DRIVER_DEFAULT (Delhi centroid). When the driver
// goes online without a GPS lock yet, we now send availability without
// lat/lng — the server falls back to the driver's stored location and
// will update on the next location push. No more "you appear in Delhi"
// edge case for first-launch drivers anywhere outside Delhi.

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

  // Subscribe to live booking offers via socket. When we already have a
  // GPS fix (`myPos`) we include it so dispatch's matching algorithm
  // sees us in the right place; otherwise we omit lat/lng and the next
  // location push will update it.
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!available || subscribed.current) return;
      const sock = await getSocket();
      const payload: { available: true; lat?: number; lng?: number } = { available: true };
      if (myPos) {
        payload.lat = myPos.lat;
        payload.lng = myPos.lng;
      }
      sock.emit("driver:availability", payload);
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
  }, [available, myPos]);

  const toggleAvailable = useCallback(async () => {
    const next = !available;
    setAvailable(next);
    try {
      await driverApi.setAvailability(next ? "AVAILABLE" : "OFFLINE", myPos?.lat, myPos?.lng);
      const sock = await getSocket();
      const payload: { available: boolean; lat?: number; lng?: number } = { available: next };
      if (myPos) {
        payload.lat = myPos.lat;
        payload.lng = myPos.lng;
      }
      sock.emit("driver:availability", payload);
    } catch (e: any) {
      Alert.alert("Could not update", e?.message ?? "Try again.");
      setAvailable(!next);
    }
  }, [available, myPos]);

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

      {/* Hide the entire INCOMING REQUESTS section while the driver is on
        * an active trip — a one-at-a-time policy. Pending requests stay in
        * the queue server-side; other drivers pick them up. This is the
        * "auto-hide on accept" behaviour requested for v1.0.8. */}
      {!activeTrip ? (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Text variant="label" tone="secondary">INCOMING REQUESTS</Text>
              {available && (() => {
                const c = pending.filter((b) => !ignored.has(b.id)).length;
                return c > 0 ? <Pill label={`${c}`} color={colors.primary} bg={colors.primaryFaint} /> : null;
              })()}
            </View>
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
              // Sort closest-first so the driver always sees the most-likely
              // accept candidate at the top. Falls back to creation order
              // when GPS isn't ready yet.
              const visible = pending
                .filter((b) => !ignored.has(b.id))
                .map((b) => ({
                  b,
                  km: myPos ? haversineKm(myPos.lat, myPos.lng, b.pickupLat, b.pickupLng) : null
                }))
                .sort((a, b) => {
                  if (a.km == null && b.km == null) return 0;
                  if (a.km == null) return 1;
                  if (b.km == null) return -1;
                  return a.km - b.km;
                });
              if (visible.length === 0) {
                return (
                  <Card flat>
                    <EmptyState title="No active requests" description="New SOS requests will appear here instantly." />
                  </Card>
                );
              }
              return visible.map(({ b, km }, idx) => (
                <RequestRow
                  key={b.id}
                  booking={b}
                  km={km}
                  eta={km != null ? estimateEtaMin(km) : null}
                  driverPos={myPos}
                  highlight={idx === 0}
                  onIgnore={() => ignore(b.id)}
                  onAccept={() => accept(b)}
                />
              ));
            })()
          ) : (
            <Card flat>
              <EmptyState title="You're offline" description="Go online above to receive emergency requests." />
            </Card>
          )}
        </View>
      ) : null}

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

/**
 * Compact list-row for an incoming booking. Designed for high-density
 * stacking (10+ requests at once). Tap the row to expand the inline map;
 * "Accept" gives a press-scale animation + spinner while the request fires
 * so the driver gets clear feedback before the row vanishes from the list.
 */
function RequestRow({
  booking,
  km,
  eta,
  driverPos,
  highlight,
  onIgnore,
  onAccept
}: {
  booking: Booking;
  km: number | null;
  eta: number | null;
  driverPos: { lat: number; lng: number } | null;
  highlight: boolean;
  onIgnore: () => void;
  onAccept: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useFadeIn();

  // Pulsing border highlight on the top (closest) request so the driver's
  // eye lands on it first.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!highlight) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [highlight, pulse]);

  const borderOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  const handleAccept = async () => {
    // Press-scale + busy spinner. Once the API resolves, the parent's
    // refresh() removes the booking from `pending` so this row unmounts
    // automatically — no extra cleanup needed here.
    setBusy(true);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true })
    ]).start();
    try {
      await onAccept();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View style={[fade, { transform: [{ scale }] }]}>
      {/* No more pulsing card border — feedback was that the whole-card pulse
        * was too much. Hook is now scoped to the Accept button (see below). */}
      <Card padding="md">
        <Pressable onPress={() => setExpanded((x) => !x)} android_ripple={{ color: "rgba(0,0,0,0.04)" }}>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <PulseDot size={8} color={colors.primary} rings={1} />
                <Pill label={prettyEmergency(booking.emergencyType)} />
              </View>
              <Text variant="tiny" tone="muted">{secondsAgo(booking.createdAt)}</Text>
            </View>
            <Text variant="body" weight="semi">
              {booking.pickupAddress ?? "Patient location"}
            </Text>
            {/* Distance + ETA chips always rendered — visible without expanding. */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", gap: space.lg }}>
                <View>
                  <Text variant="tiny" tone="secondary">DISTANCE</Text>
                  <Text variant="body" weight="bold">
                    {km != null ? `${km.toFixed(1)} km` : "—"}
                  </Text>
                </View>
                <View>
                  <Text variant="tiny" tone="secondary">ETA</Text>
                  <Text variant="body" weight="bold" tone="primary">
                    {eta != null ? `~${eta} min` : "—"}
                  </Text>
                </View>
              </View>
              <Text variant="tiny" tone="muted">
                {expanded ? "Hide map ▴" : "Show map ▾"}
              </Text>
            </View>
          </View>
        </Pressable>

        {expanded ? (
          <View style={{ marginTop: space.md }}>
            <MapEmbed
              pickup={{ lat: booking.pickupLat, lng: booking.pickupLng, label: "Patient" }}
              driver={driverPos ? { lat: driverPos.lat, lng: driverPos.lng, label: "You" } : null}
              height={180}
            />
          </View>
        ) : null}

        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
          <View style={{ flex: 1 }}>
            <Button label="Ignore" onPress={onIgnore} variant="outline" fullWidth disabled={busy} />
          </View>
          <View style={{ flex: 2 }}>
            {/* Hook moved here — the Accept button itself glows on the top
              * (closest) row. Eye-catching without the whole-card noise. */}
            <Animated.View style={highlight ? { opacity: borderOpacity } : undefined}>
              <Button
                label={busy ? "Accepting…" : "Accept"}
                onPress={handleAccept}
                loading={busy}
                fullWidth
                size="lg"
                testID={`accept-${booking.id}`}
              />
            </Animated.View>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}

function secondsAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return new Date(iso).toLocaleTimeString();
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
