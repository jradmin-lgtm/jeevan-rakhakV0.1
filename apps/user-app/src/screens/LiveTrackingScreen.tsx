import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View } from "react-native";
import {
  AppHeader,
  Button,
  Card,
  ContactSupport,
  Input,
  MapEmbed,
  OtpToast,
  Pill,
  PulseDot,
  Screen,
  StatusBadge,
  Text,
  colors,
  radius,
  space
} from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { getSocket } from "../socket";
import { prettyEmergency } from "./HomeScreen";

type DriverProfile = {
  id: string;
  name?: string | null;
  phone: string;
  vehicleNumber?: string | null;
  vehicleType?: string | null;
  rating?: number | null;
};

type DriverPosition = { lat: number; lng: number; lastSeenAt?: string | null };

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
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
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

    // Centralised refresh: pulls booking + driver profile + last-known driver
    // position. Used by both the 5s poll and the socket booking:event handler.
    // The driver position from this endpoint is the *fallback* — if socket
    // relay drops (free-tier dyno sleep, transient network), the user still
    // sees the ambulance move within 5 seconds.
    const refreshFromApi = async () => {
      try {
        const r: any = await bookingsApi.get(initial.id);
        if (!mounted) return;
        setBooking(r.booking);
        if (r.driverProfile) setDriverProfile(r.driverProfile);
        // Only apply the polled driver position if the live socket stream
        // hasn't given us anything fresher (<15s old). This keeps the marker
        // bumping smoothly when the socket IS working.
        const pollPos = r.driverPosition;
        if (pollPos && pollPos.lat != null && pollPos.lng != null) {
          setDriverPos((current) => {
            if (current && Date.now() - current.ts < 15_000) return current;
            const ts = pollPos.lastSeenAt ? new Date(pollPos.lastSeenAt).getTime() : Date.now();
            return { lat: pollPos.lat, lng: pollPos.lng, ts };
          });
        }
      } catch {
        /* keep last good */
      }
    };

    (async () => {
      const sock = await getSocket();
      sock.emit("booking:subscribe", { bookingId: initial.id });
      sock.on("booking:event", (msg: any) => {
        if (msg.bookingId !== initial.id) return;
        void refreshFromApi();
      });
      sock.on("driver:location:update", (loc: any) => {
        if (loc.bookingId !== initial.id) return;
        // Socket update wins — always overwrite (it's the freshest signal).
        setDriverPos({ lat: loc.lat, lng: loc.lng, ts: loc.ts ?? Date.now() });
      });

      void refreshFromApi();
      pollRef.current = setInterval(refreshFromApi, 5000);
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
      booking.status === "REQUESTED"
        ? "No driver has been assigned yet — you can cancel freely."
        : "A driver is on the way. They'll be notified that the trip was cancelled.",
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
              // Server returns 409 cannot_cancel once the patient has been
              // picked up — they're already in the ambulance. Surface a
              // human-readable message instead of the raw error code.
              const msg = String(e?.message ?? "").toLowerCase();
              if (msg.includes("cannot_cancel")) {
                Alert.alert(
                  "Trip already in progress",
                  "You're already in the ambulance. Cancellation isn't possible once the trip has started — please coordinate with the driver if anything has changed."
                );
              } else {
                Alert.alert("Could not cancel", e?.message ?? "Please try again.");
              }
            }
          }
        }
      ]
    );
  };

  const finished = ["COMPLETED", "CANCELLED", "TIMED_OUT"].includes(booking.status);
  // Match the server gate: user can cancel until the driver has actually
  // started moving with the patient (PICKED_UP). The earlier v1.0.9 client
  // only allowed REQUESTED, which forced users to call the driver to cancel
  // — confusing and error-prone. Server still rejects PICKED_UP/COMPLETED
  // cancels with a 409 that we render as a friendly toast.
  const cancellable = ["REQUESTED", "ACCEPTED", "ARRIVED"].includes(booking.status);

  // ── Timer / ETA derivation ───────────────────────────────────────────────
  // v1.0.11.2: removed 90-min gate on the help banner — testers wanted
  // support one tap away from the moment the trip begins, not buried until
  // 90 min in. Banner is now always-on during an active trip.
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

      {/* Ride OTP — visible from the moment the booking is created so the
        * patient can rehearse the code. Goes prominently red once the driver
        * has actually arrived ("Tell this code to the driver"). Disappears
        * after PICKED_UP since the OTP has been consumed. */}
      {booking.rideOtpCode && ["REQUESTED", "ACCEPTED", "ARRIVED"].includes(booking.status) ? (
        <Card style={
          booking.status === "ARRIVED"
            ? { borderColor: colors.primary, borderWidth: 2, backgroundColor: "#FFF5F4" }
            : undefined
        }>
          <View style={{ gap: space.sm, alignItems: "center" }}>
            <Text variant="label" tone={booking.status === "ARRIVED" ? "danger" : "secondary"}>
              {booking.status === "ARRIVED" ? "TELL THIS OTP TO THE DRIVER" : "RIDE OTP"}
            </Text>
            <Text style={{ fontSize: 40, fontWeight: "700", color: colors.primary, letterSpacing: 8 }}>
              {booking.rideOtpCode}
            </Text>
            <Text variant="tiny" tone="muted" align="center">
              The driver will ask you for this 4-digit code before starting the trip.
            </Text>
          </View>
        </Card>
      ) : null}

      <Card padding="md">
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="label" tone="secondary">
              {driverPos ? "DRIVER LIVE" : "PICKUP"}
            </Text>
            {driverPos ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <PulseDot size={8} color={colors.success} rings={1} />
                <Text variant="tiny" tone="success" weight="bold">
                  LIVE · {Math.max(0, Math.round((Date.now() - driverPos.ts) / 1000))}s
                </Text>
              </View>
            ) : null}
          </View>
          <MapEmbed
            pickup={{ lat: booking.pickupLat, lng: booking.pickupLng, label: "Pickup" }}
            driver={driverPos ? { lat: driverPos.lat, lng: driverPos.lng, label: "Driver" } : null}
            height={280}
          />
          {driverPos ? (
            <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: space.xs }}>
              <View style={{ alignItems: "center" }}>
                <Text variant="tiny" tone="secondary">DISTANCE</Text>
                <Text variant="heading" weight="bold">
                  {haversineKm(driverPos.lat, driverPos.lng, booking.pickupLat, booking.pickupLng).toFixed(1)} km
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text variant="tiny" tone="secondary">ETA</Text>
                <Text variant="heading" weight="bold" tone="primary">
                  ~{estimateEtaMin(haversineKm(driverPos.lat, driverPos.lng, booking.pickupLat, booking.pickupLng))} min
                </Text>
              </View>
            </View>
          ) : (
            <Text variant="tiny" tone="muted" align="center" style={{ paddingVertical: space.xs }}>
              Live driver position appears on this map once the trip starts.
            </Text>
          )}
          <Button
            label="Open in Google Maps"
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

      {/* Patient info form — auto-shown after booking confirmation until the
        * user submits at least condition + name. Team feedback 1.6: the
        * backend / hospital coord team needs this prepared in advance.
        * Driver sees only the name/age/gender; condition + notes are
        * admin/hospital-only. Hidden once any field is filled or once trip
        * progresses past arrival (no point asking en route). */}
      {!finished
        && ["REQUESTED", "ACCEPTED", "ARRIVED"].includes(booking.status)
        && !booking.patientCondition
        ? (
          <PatientInfoCard
            bookingId={booking.id}
            onSaved={(b) => setBooking((curr) => ({ ...curr, ...b }))}
          />
        ) : null}

      {/* Driver info card — appears the moment a driver accepts. One-tap
        * call to the driver's phone (team feedback 1.11b). Hidden once the
        * trip is in a terminal state. */}
      {driverProfile && !finished && booking.status !== "REQUESTED" ? (
        <Card padding="md">
          <View style={driverCardStyles.row}>
            <View style={driverCardStyles.avatar}>
              <Text variant="heading" weight="bold" style={{ color: colors.primary }}>
                {(driverProfile.name ?? "D").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Text variant="body" weight="semi">{driverProfile.name ?? "Driver"}</Text>
                {driverProfile.rating != null ? (
                  <Pill label={`⭐ ${driverProfile.rating.toFixed(1)}`} color={colors.success} bg="#E8F8F1" />
                ) : null}
              </View>
              <Text variant="small" tone="secondary">
                {driverProfile.vehicleNumber ?? "Vehicle pending"}
                {driverProfile.vehicleType ? ` · ${driverProfile.vehicleType}` : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => Linking.openURL(`tel:${driverProfile.phone}`).catch(() => {})}
              style={driverCardStyles.callBtn}
              accessibilityLabel={`Call ${driverProfile.name ?? "driver"}`}
            >
              <Text style={driverCardStyles.callIcon}>📞</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {/* v1.0.11.2: always-on Need help section during an active trip. */}
      {!finished ? (
        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="danger">NEED HELP?</Text>
            <Text variant="small" tone="secondary">
              Contact our support team any time — we&apos;ll reach the driver
              and coordinate.
            </Text>
            <ContactSupport bookingId={booking.id} compact />
          </View>
        </Card>
      ) : null}

      {!finished ? (
        cancellable ? (
          <Button label="Cancel booking" variant="outline" onPress={onCancel} fullWidth />
        ) : (
          <Text variant="tiny" tone="muted" align="center">
            Trip is in progress — coordinate with the driver by call if you need to change anything.
          </Text>
        )
      ) : (
        <Button label="Done" onPress={onClose} fullWidth />
      )}
      <OtpToast message={toast} onHide={() => setToast(null)} />
    </Screen>
  );
}

// Emergency categories from team feedback 1.6 (dropdown). Mapped to the
// patient_condition text column server-side. Driver app never reads this.
const EMERGENCY_CONDITIONS = [
  "Road Accident",
  "Trauma — Firearm",
  "Trauma — Sharp Object",
  "Pregnancy",
  "Diabetic Unconscious",
  "Snake Bite",
  "Poison Consumption",
  "Chest Pain / Heart Attack",
  "Breathing Difficulty",
  "Unconscious Patient",
  "Severe Bleeding",
  "Burn / Fire",
  "Stroke Symptoms",
  "High Fever / Seizure",
  "Other"
];

function PatientInfoCard({ bookingId, onSaved }: { bookingId: string; onSaved: (b: any) => void }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "O" | null>(null);
  const [condition, setCondition] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!condition) {
      setErr("Please select the emergency condition.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const ageNum = age ? parseInt(age, 10) : undefined;
      const r = await bookingsApi.patientInfo(bookingId, {
        patientName: name || undefined,
        patientAge: Number.isFinite(ageNum) ? ageNum : undefined,
        patientGender: gender ?? undefined,
        patientCondition: condition,
        patientNotes: notes || undefined
      });
      onSaved(r.booking);
    } catch (e: any) {
      setErr(e?.message ?? "Could not save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderColor: colors.primary, borderWidth: 1 }}>
      <View style={{ gap: space.md }}>
        <View>
          <Text variant="label" tone="primary">PATIENT DETAILS</Text>
          <Text variant="tiny" tone="secondary">
            Helps our team prepare medical response. Only condition and notes go to the hospital — driver sees name only.
          </Text>
        </View>

        <View style={patientStyles.condGrid}>
          {EMERGENCY_CONDITIONS.map((c) => {
            const selected = condition === c;
            return (
              <Pressable
                key={c}
                onPress={() => setCondition(c)}
                style={[patientStyles.chip, selected ? patientStyles.chipActive : null]}
              >
                <Text variant="tiny" weight={selected ? "bold" : "regular"} style={{ color: selected ? colors.textInverse : colors.textPrimary }}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Input
          label="Patient name"
          value={name}
          onChangeText={setName}
          placeholder="Optional · helps the driver"
        />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Input label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="Optional" />
          </View>
          <View style={{ flex: 1.4, gap: 4 }}>
            <Text variant="label" tone="secondary">Gender</Text>
            <View style={{ flexDirection: "row", gap: space.xs }}>
              {(["M", "F", "O"] as const).map((g) => {
                const selected = gender === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => setGender(g)}
                    style={[patientStyles.genderChip, selected ? patientStyles.chipActive : null]}
                  >
                    <Text variant="small" weight="semi" style={{ color: selected ? colors.textInverse : colors.textPrimary }}>
                      {g === "M" ? "Male" : g === "F" ? "Female" : "Other"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        <Input
          label="Notes for medical team (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g., diabetic, on blood thinners"
          multiline
        />
        {err ? <Text variant="tiny" tone="danger">{err}</Text> : null}
        <Button
          label={busy ? "Sending…" : "Send to medical team"}
          onPress={submit}
          loading={busy}
          disabled={!condition}
          fullWidth
        />
      </View>
    </Card>
  );
}

const patientStyles = StyleSheet.create({
  condGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  genderChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center"
  }
});

const driverCardStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center"
  },
  callBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.success,
    alignItems: "center",
    justifyContent: "center"
  },
  callIcon: { fontSize: 22 }
});

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
