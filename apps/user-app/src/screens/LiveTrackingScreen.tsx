import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, View } from "react-native";
import {
  AppHeader,
  Button,
  Card,
  MapEmbed,
  OtpToast,
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

function openOnGoogleMaps(lat: number, lng: number) {
  // Universal Google Maps URL — opens native app if installed, browser
  // otherwise. No Maps API key needed, no quota cost.
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  Linking.openURL(url).catch(() => {});
}

// Haversine distance in km — small enough to inline.
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

// Rough urban-India ETA. Free-tier-friendly (no Google Distance Matrix call).
function estimateEtaMin(km: number, avgKmh = 28, roadFactor = 1.4): number {
  return Math.max(1, Math.round(((km * roadFactor) / avgKmh) * 60));
}

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Props = {
  booking: Booking;
  onClose: () => void;
};

export function LiveTrackingScreen({ booking: initial, onClose }: Props) {
  const [booking, setBooking] = useState<Booking>(initial);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatusRef = useRef<string>(initial.status);

  // 1-second tick so the elapsed/ETA timer counts down/up live.
  useEffect(() => {
    tickRef.current = setInterval(() => setNowTs(Date.now()), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // Toast on status transitions — "Driver assigned!" being the headline one.
  useEffect(() => {
    const prev = lastStatusRef.current;
    if (prev !== booking.status) {
      if (prev === "REQUESTED" && booking.status === "ACCEPTED") {
        setToast("Driver assigned · on the way");
      } else if (booking.status === "ARRIVED") {
        setToast("Driver has arrived");
      } else if (booking.status === "PICKED_UP") {
        setToast("Pickup confirmed");
      } else if (booking.status === "COMPLETED") {
        setToast("Trip completed");
      }
      lastStatusRef.current = booking.status;
    }
  }, [booking.status]);

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

  // ── Timer / ETA derivation ───────────────────────────────────────────────
  const createdMs = booking.createdAt ? new Date(booking.createdAt).getTime() : Date.now();
  const elapsedSec = Math.max(0, Math.floor((nowTs - createdMs) / 1000));
  let timerLabel = "";
  let timerValue = "";
  if (booking.status === "REQUESTED") {
    timerLabel = "Looking for driver";
    timerValue = formatElapsed(elapsedSec);
  } else if (booking.status === "ACCEPTED" && driverPos) {
    const km = haversineKm(driverPos.lat, driverPos.lng, booking.pickupLat, booking.pickupLng);
    timerLabel = "Driver arrives in";
    timerValue = `~${estimateEtaMin(km)} min`;
  } else if (booking.status === "ARRIVED") {
    timerLabel = "Driver waiting";
    timerValue = "at pickup";
  } else if (booking.status === "PICKED_UP" && driverPos && booking.dropLat != null && booking.dropLng != null) {
    const km = haversineKm(driverPos.lat, driverPos.lng, booking.dropLat, booking.dropLng);
    timerLabel = "Hospital ETA";
    timerValue = `~${estimateEtaMin(km)} min`;
  } else if (booking.status === "PICKED_UP") {
    timerLabel = "En route to hospital";
    timerValue = formatElapsed(elapsedSec);
  }

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
          {timerLabel ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text variant="small" tone="secondary">{timerLabel}</Text>
              <Text variant="heading" weight="bold" tone="primary">{timerValue}</Text>
            </View>
          ) : null}
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

      <Card padding="md">
        <View style={{ gap: space.sm }}>
          <Text variant="label" tone="secondary">
            {driverPos ? "DRIVER LIVE" : "PICKUP"}
          </Text>
          <MapEmbed
            pickup={{ lat: booking.pickupLat, lng: booking.pickupLng, label: "Pickup" }}
            driver={driverPos ? { lat: driverPos.lat, lng: driverPos.lng, label: "Driver" } : null}
            height={220}
          />
          {driverPos ? (
            <Text variant="tiny" tone="muted">
              Driver at {driverPos.lat.toFixed(5)}, {driverPos.lng.toFixed(5)} · updated{" "}
              {Math.max(0, Math.round((Date.now() - driverPos.ts) / 1000))}s ago
            </Text>
          ) : (
            <Text variant="tiny" tone="muted">
              Live driver position appears on this map once the trip starts.
            </Text>
          )}
          <Button
            label={driverPos ? "Open driver in Google Maps" : "Open pickup in Google Maps"}
            variant="ghost"
            onPress={() =>
              driverPos
                ? openOnGoogleMaps(driverPos.lat, driverPos.lng)
                : openOnGoogleMaps(booking.pickupLat, booking.pickupLng)
            }
            fullWidth
          />
        </View>
      </Card>

      {!finished ? (
        <Button label="Cancel booking" variant="outline" onPress={onCancel} fullWidth />
      ) : (
        <Button label="Done" onPress={onClose} fullWidth />
      )}
      <OtpToast message={toast} onHide={() => setToast(null)} />
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
