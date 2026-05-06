import React, { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import {
  AppHeader,
  Button,
  Card,
  MapPlaceholder,
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

const DRIVER_DEFAULT = { lat: 28.6139, lng: 77.209 };

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
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  // Push location every 5s to socket + every 15s to API for persistence.
  useEffect(() => {
    let mounted = true;
    let counter = 0;
    (async () => {
      const sock = await getSocket();
      ticker.current = setInterval(async () => {
        if (!mounted) return;
        counter += 1;
        const drift = (counter * 0.0001) % 0.005;
        const lat = DRIVER_DEFAULT.lat + drift;
        const lng = DRIVER_DEFAULT.lng + drift;
        sock.emit("driver:location", { bookingId: booking.id, lat, lng, ts: Date.now() });
        setPushedAt(Date.now());
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
        </View>
      </Card>

      <Card padding="md">
        <MapPlaceholder
          driverActive={sharing}
          pickupLabel="Patient"
          driverLabel="You"
          height={180}
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
          <Text variant="body">{booking.pickupAddress ?? `${booking.pickupLat.toFixed(4)}, ${booking.pickupLng.toFixed(4)}`}</Text>
          {booking.dropAddress ? (
            <>
              <Text variant="label" tone="secondary">DROP HOSPITAL</Text>
              <Text variant="body">{booking.dropAddress}</Text>
            </>
          ) : null}
          {booking.fareEstimateInr ? (
            <>
              <Text variant="label" tone="secondary">PAYOUT (EST.)</Text>
              <Text variant="title" weight="bold" tone="primary">₹{booking.fareEstimateInr}</Text>
            </>
          ) : null}
        </View>
      </Card>

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
