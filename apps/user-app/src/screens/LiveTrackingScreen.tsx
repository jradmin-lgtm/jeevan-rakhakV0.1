import React, { useEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import {
  AppHeader,
  Button,
  Card,
  Pill,
  Screen,
  StatusBadge,
  Text,
  colors,
  space
} from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { getSocket } from "../socket";
import { prettyEmergency } from "./HomeScreen";

type Props = {
  booking: Booking;
  onClose: () => void;
};

export function LiveTrackingScreen({ booking: initial, onClose }: Props) {
  const [booking, setBooking] = useState<Booking>(initial);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const sock = await getSocket();
      sock.emit("booking:subscribe", { bookingId: initial.id });
      sock.on("booking:event", (msg: any) => {
        if (msg.bookingId !== initial.id) return;
        // Refresh authoritative state from API on any event.
        bookingsApi.get(initial.id).then((r) => mounted && setBooking(r.booking)).catch(() => {});
      });
      sock.on("driver:location:update", (loc: any) => {
        if (loc.bookingId !== initial.id) return;
        setDriverPos({ lat: loc.lat, lng: loc.lng, ts: loc.ts });
      });

      // Fallback polling in case socket fan-out drops.
      pollRef.current = setInterval(() => {
        bookingsApi.get(initial.id).then((r) => mounted && setBooking(r.booking)).catch(() => {});
      }, 5000);
    })();

    return () => {
      mounted = false;
      if (pollRef.current) clearInterval(pollRef.current);
      void getSocket().then((s) => s.emit("booking:unsubscribe", { bookingId: initial.id }));
    };
  }, [initial.id]);

  const onCancel = async () => {
    Alert.alert(
      "Cancel this booking?",
      "If a driver is already on the way, please confirm with them on call.",
      [
        { text: "Keep booking", style: "cancel" },
        {
          text: "Cancel booking",
          style: "destructive",
          onPress: async () => {
            try {
              await bookingsApi.cancel(initial.id);
              onClose();
            } catch (e: any) {
              Alert.alert("Could not cancel", e?.message ?? "Try again.");
            }
          }
        }
      ]
    );
  };

  const finished = ["COMPLETED", "CANCELLED", "TIMED_OUT"].includes(booking.status);

  return (
    <Screen>
      <AppHeader title="Live tracking" subtitle={`Booking ${booking.id.slice(0, 8)}…`} onBack={onClose} />

      <Card>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pill label={prettyEmergency(booking.emergencyType)} />
            <StatusBadge status={booking.status} />
          </View>
          <Text variant="heading">{statusHeadline(booking.status)}</Text>
          <Text variant="small" tone="secondary">{statusSubline(booking.status)}</Text>
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">PICKUP</Text>
          <Text variant="body">{booking.pickupAddress ?? `${booking.pickupLat.toFixed(4)}, ${booking.pickupLng.toFixed(4)}`}</Text>
          {booking.dropAddress ? (
            <>
              <Text variant="label" tone="secondary">DROP</Text>
              <Text variant="body">{booking.dropAddress}</Text>
            </>
          ) : null}
          {booking.fareEstimateInr ? (
            <>
              <Text variant="label" tone="secondary">ESTIMATED FARE</Text>
              <Text variant="heading" weight="bold">₹{booking.fareEstimateInr}</Text>
            </>
          ) : null}
        </View>
      </Card>

      {driverPos ? (
        <Card flat>
          <Text variant="label" tone="secondary">DRIVER LOCATION (LIVE)</Text>
          <Text variant="body">
            {driverPos.lat.toFixed(5)}, {driverPos.lng.toFixed(5)} ·{" "}
            <Text tone="muted" variant="small">
              updated {Math.max(0, Math.round((Date.now() - driverPos.ts) / 1000))}s ago
            </Text>
          </Text>
        </Card>
      ) : (
        <Card flat>
          <Text variant="small" tone="secondary">
            Map view will render here. Live coordinates appear once driver is en route.
          </Text>
        </Card>
      )}

      {!finished ? (
        <Button label="Cancel booking" variant="outline" onPress={onCancel} fullWidth />
      ) : (
        <Button label="Done" onPress={onClose} fullWidth />
      )}
    </Screen>
  );
}

function statusHeadline(status: string): string {
  switch (status) {
    case "REQUESTED": return "Finding the nearest ambulance…";
    case "ACCEPTED": return "Driver is on the way to you";
    case "ARRIVED": return "Driver has arrived";
    case "PICKED_UP": return "On the way to hospital";
    case "COMPLETED": return "Trip completed";
    case "CANCELLED": return "Booking cancelled";
    case "TIMED_OUT": return "No driver available right now";
    default: return status;
  }
}

function statusSubline(status: string): string {
  switch (status) {
    case "REQUESTED": return "We are notifying available ambulances. This usually takes under 60 seconds.";
    case "ACCEPTED": return "Track the live position of your ambulance below.";
    case "ARRIVED": return "Please reach the pickup spot. Your safety is our priority.";
    case "PICKED_UP": return "We're heading to the destination hospital.";
    case "COMPLETED": return "Thank you. Please rate your experience.";
    case "CANCELLED": return "You can book another ambulance from the home screen.";
    case "TIMED_OUT": return "Try booking again in a moment, or use the SOS button for fastest dispatch.";
    default: return "";
  }
}
