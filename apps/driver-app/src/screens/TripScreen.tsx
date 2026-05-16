import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, View } from "react-native";
import * as Location from "expo-location";
import {
  AppHeader,
  Button,
  Card,
  MapEmbed,
  Pill,
  PulseDot,
  Screen,
  StatusBadge,
  Stepper,
  Text,
  colors,
  space
} from "@jr/ui";
import { Booking, bookings as bookingsApi, driver as driverApi } from "../api";
import { getSocket } from "../socket";
import { prettyEmergency } from "./DashboardScreen";

// Fallback only used if GPS permission is denied or no fix yet.
const FALLBACK_DRIVER = { lat: 28.6139, lng: 77.209 };

function openTurnByTurn(lat: number, lng: number) {
  // Opens native Google Maps app with directions to pickup. No Maps API key
  // needed — uses Google's universal URL scheme. Free, no quota.
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  Linking.openURL(url).catch(() => {
    /* Maps app not installed — fall back to opening in browser, same URL works */
  });
}

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

// Quick urban-India ETA — free, no Maps API. Matches user-app's same formula.
function estimateEtaMin(km: number, avgKmh = 28, roadFactor = 1.4): number {
  return Math.max(1, Math.round(((km * roadFactor) / avgKmh) * 60));
}

const STEPS = [
  { key: "ACCEPTED", label: "Drive" },
  { key: "ARRIVED", label: "Arrive" },
  { key: "PICKED_UP", label: "Pickup" },
  { key: "COMPLETED", label: "Drop off" }
];

function statusToIndex(status: string): number {
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

export function TripScreen({ booking: initial, onClose }: { booking: Booking; onClose: () => void }) {
  const [booking, setBooking] = useState<Booking>(initial);
  const [busy, setBusy] = useState(false);
  const [pushedAt, setPushedAt] = useState<number | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  // Push real GPS location every 5s to socket + every 15s to API for persistence.
  useEffect(() => {
    let mounted = true;
    let counter = 0;

    (async () => {
      // Foreground permission only — pilot doesn't track when the app is
      // backgrounded. If denied, fall back to a static centroid so the patient
      // at least sees something on the live map.
      try {
        await Location.requestForegroundPermissionsAsync();
      } catch {
        /* ignored */
      }
      const sock = await getSocket();
      ticker.current = setInterval(async () => {
        if (!mounted) return;
        counter += 1;

        let lat = FALLBACK_DRIVER.lat;
        let lng = FALLBACK_DRIVER.lng;
        try {
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = fix.coords.latitude;
          lng = fix.coords.longitude;
        } catch {
          /* GPS unavailable on this tick — keep the previous fallback */
        }

        sock.emit("driver:location", { bookingId: booking.id, lat, lng, ts: Date.now() });
        setPushedAt(Date.now());
        setMyPos({ lat, lng });
        if (counter % 3 === 0) {
          try { await driverApi.pushLocation(lat, lng, booking.id); } catch { /* ignore */ }
        }
      }, 5000);
    })();
    return () => {
      mounted = false;
      if (ticker.current) clearInterval(ticker.current);
    };
  }, [booking.id]);

  // Refresh booking state regularly so user-driven cancels show up.
  useEffect(() => {
    const id = setInterval(() => {
      bookingsApi.get(booking.id).then((r) => setBooking(r.booking)).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [booking.id]);

  const advance = async (
    fn: () => Promise<{ booking: Booking }>,
    confirm?: { title: string; body: string }
  ) => {
    const run = async () => {
      setBusy(true);
      try {
        const r = await fn();
        setBooking(r.booking);
      } catch (e: any) {
        Alert.alert("Could not update", e?.message ?? "Try again.");
      } finally {
        setBusy(false);
      }
    };
    if (confirm) {
      Alert.alert(confirm.title, confirm.body, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: run }
      ]);
    } else {
      void run();
    }
  };

  const finished = ["COMPLETED", "CANCELLED", "TIMED_OUT"].includes(booking.status);
  const failed = ["CANCELLED", "TIMED_OUT"].includes(booking.status);
  const sharing = !finished && ["ACCEPTED", "ARRIVED", "PICKED_UP"].includes(booking.status);
  const stepIndex = statusToIndex(booking.status);

  // 90-min "Need help?" check. Same shape as user-app: if the trip is still
  // active 90 min after it was created, show a support-contact banner so the
  // driver can flag anything going wrong (vehicle issue, patient changed mind,
  // can't reach drop, etc).
  const createdMs = booking.createdAt ? new Date(booking.createdAt).getTime() : Date.now();
  const showHelpBanner = !finished && Date.now() - createdMs > 90 * 60 * 1000;

  return (
    <Screen>
      <AppHeader title="Active trip" subtitle={`#${booking.id.slice(0, 8)}`} onBack={onClose} />

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pill label={prettyEmergency(booking.emergencyType)} />
            <StatusBadge status={booking.status} />
          </View>
          <Stepper steps={STEPS} currentIndex={failed ? -1 : stepIndex} failed={failed} />
          <View style={{ gap: 4 }}>
            <Text variant="heading">{stepHeadline(booking.status)}</Text>
            <Text variant="small" tone="secondary">{stepSubline(booking.status)}</Text>
          </View>
          {(() => {
            // ETA card shown only when we have a GPS fix + a destination ahead.
            if (!myPos) return null;
            let label: string | null = null;
            let value: string | null = null;
            if (booking.status === "ACCEPTED") {
              const km = haversineKm(myPos.lat, myPos.lng, booking.pickupLat, booking.pickupLng);
              label = "ETA to pickup";
              value = `~${estimateEtaMin(km)} min · ${km.toFixed(1)} km`;
            } else if (booking.status === "PICKED_UP" && booking.dropLat != null && booking.dropLng != null) {
              const km = haversineKm(myPos.lat, myPos.lng, booking.dropLat, booking.dropLng);
              label = "ETA to hospital";
              value = `~${estimateEtaMin(km)} min · ${km.toFixed(1)} km`;
            }
            if (!label || !value) return null;
            return (
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text variant="small" tone="secondary">{label}</Text>
                <Text variant="heading" weight="bold" tone="primary">{value}</Text>
              </View>
            );
          })()}
        </View>
      </Card>

      <Card padding="md">
        <MapEmbed
          pickup={{ lat: booking.pickupLat, lng: booking.pickupLng, label: "Patient" }}
          driver={myPos ? { lat: myPos.lat, lng: myPos.lng, label: "You" } : null}
          height={220}
        />
        {sharing ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md }}>
            <PulseDot size={10} color={colors.success} />
            <Text variant="small" tone="secondary">
              Sharing location with patient · last sent {pushedAt ? `${Math.max(0, Math.round((Date.now() - pushedAt) / 1000))}s ago` : "starting…"}
            </Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">PICKUP</Text>
          <Text variant="body">{booking.pickupAddress ?? "Patient location"}</Text>
          <Text variant="tiny" tone="muted">
            {booking.pickupLat.toFixed(5)}, {booking.pickupLng.toFixed(5)}
          </Text>
          {!finished ? (
            <Button
              label="Open in Google Maps"
              variant="outline"
              onPress={() => openTurnByTurn(booking.pickupLat, booking.pickupLng)}
              fullWidth
            />
          ) : null}
          {booking.dropAddress ? (
            <>
              <Text variant="label" tone="secondary">DROP HOSPITAL</Text>
              <Text variant="body">{booking.dropAddress}</Text>
              {booking.dropLat != null && booking.dropLng != null && !finished ? (
                <Button
                  label="Navigate to drop"
                  variant="ghost"
                  onPress={() => openTurnByTurn(booking.dropLat!, booking.dropLng!)}
                  fullWidth
                />
              ) : null}
            </>
          ) : null}
          {/*
           * Fare amount intentionally hidden from drivers during launch.
           * Many patients use the PILOT100 100%-off coupon → driver would
           * see ₹250 but collect ₹0, causing confusion. Once paid bookings
           * land and the coupon flow is server-side, revisit this card.
           */}
          <Text variant="label" tone="secondary">PAYMENT</Text>
          <Text variant="body" tone="secondary">
            Paid in-app · Nothing to collect from patient
          </Text>
        </View>
      </Card>

      {showHelpBanner ? (
        <Card>
          <View style={{ gap: space.xs }}>
            <Text variant="label" tone="danger">NEED HELP?</Text>
            <Text variant="body" weight="semi">This trip has been active for over 90 minutes.</Text>
            <Text variant="small" tone="secondary">
              If something has gone wrong, contact support — we&apos;ll
              coordinate with the patient and ops.
            </Text>
            <Button
              label="Email support"
              variant="outline"
              onPress={() => Linking.openURL("mailto:contact.jeevanrakshak@gmail.com?subject=Help with trip " + booking.id.slice(0, 8))}
              fullWidth
            />
          </View>
        </Card>
      ) : null}

      {!finished ? (
        <View style={{ gap: space.sm }}>
          {booking.status === "ACCEPTED" ? (
            <Button label="I have arrived" loading={busy} onPress={() => advance(() => bookingsApi.arrived(booking.id))} fullWidth size="lg" testID="arrived-cta" />
          ) : null}
          {booking.status === "ARRIVED" ? (
            <Button label="Patient picked up" loading={busy} onPress={() => advance(() => bookingsApi.pickup(booking.id))} fullWidth size="lg" testID="pickup-cta" />
          ) : null}
          {booking.status === "PICKED_UP" ? (
            <Button
              label="Drop completed"
              loading={busy}
              onPress={() =>
                advance(() => bookingsApi.complete(booking.id), {
                  title: "Mark trip complete?",
                  body: "Confirm patient has been handed over to hospital staff."
                })
              }
              fullWidth
              variant="primary"
              size="lg"
              testID="complete-cta"
            />
          ) : null}
          <Text variant="tiny" tone="muted" align="center">
            Tap the button as you complete each stage.
          </Text>
        </View>
      ) : (
        <Button label="Back to dashboard" onPress={onClose} fullWidth />
      )}
    </Screen>
  );
}

function stepHeadline(status: string): string {
  switch (status) {
    case "ACCEPTED": return "Drive to pickup";
    case "ARRIVED": return "Wait for patient";
    case "PICKED_UP": return "Drive to hospital";
    case "COMPLETED": return "Trip completed";
    case "CANCELLED": return "Booking cancelled by patient";
    default: return status;
  }
}

function stepSubline(status: string): string {
  switch (status) {
    case "ACCEPTED": return "Use Maps for navigation. Tap below when you arrive.";
    case "ARRIVED": return "Locate patient and confirm pickup.";
    case "PICKED_UP": return "Drive carefully. Tap when handed over to hospital staff.";
    case "COMPLETED": return "Great job. Payout will be added to your wallet.";
    case "CANCELLED": return "You're free to accept new requests.";
    default: return "";
  }
}
