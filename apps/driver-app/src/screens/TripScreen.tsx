import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import {
  AppHeader,
  Button,
  Card,
  ContactSupport,
  EmergencyBar,
  Input,
  MapEmbed,
  OtpInput,
  Pill,
  PulseDot,
  RatingPrompt,
  Screen,
  StatusBadge,
  Stepper,
  Text,
  colors,
  radius,
  space,
  fetchOsrmRoute
} from "@jr/ui";
import { Booking, bookings as bookingsApi, driver as driverApi, safety as safetyApi } from "../api";
import { getSocket } from "../socket";
import { prettyEmergency } from "./DashboardScreen";
import { MapLocationPicker } from "./MapLocationPicker";
import { LangToggle } from "../components/LangToggle";
import { CancelRideSheet } from "../components/CancelRideSheet";
import { WaitingRequestsPeek } from "../components/WaitingRequestsPeek";
import { useT } from "../i18n";

type UserProfile = {
  id: string;
  name?: string | null;
  phone: string;
};

// v1.0.12: removed FALLBACK_DRIVER. We no longer push Delhi centroid to the
// patient when GPS hasn't locked — that was confusing testers ("why is the
// ambulance suddenly in Delhi?"). Now we just skip the tick until we have a
// real fix; the live-tracking UI shows "Locating ambulance…" in the gap.

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
  const { t } = useT();
  const [booking, setBooking] = useState<Booking>(initial);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  // v1.2.0 (CR#2): driver-initiated cancellation sheet visibility.
  const [cancelOpen, setCancelOpen] = useState(false);
  // v1.2.0 (CR#3): set when the receiving hospital taps "Acknowledge —
  // preparing"; surfaces a reassuring banner to the driver.
  const [hospitalPreparing, setHospitalPreparing] = useState(false);
  const [pushedAt, setPushedAt] = useState<number | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  // v1.0.15: SOS map-picker visibility. Opens as a fullscreen modal when the
  // driver needs to set the drop hospital for an SOS booking that arrived
  // without one. Confirms via /set-drop and closes itself.
  const [dropPickerOpen, setDropPickerOpen] = useState(false);
  // v1.1.0 (CR#6): road route + ETA to the destination hospital, plus a
  // one-shot auto-launch of Google Maps turn-by-turn once the patient is
  // picked up (destination auto-assigned server-side at pickup).
  const [navRoute, setNavRoute] = useState<Array<[number, number]> | null>(null);
  const [navEta, setNavEta] = useState<{ km: number; min: number } | null>(null);
  const autoNavFiredRef = useRef(false);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  // v1.3.0 (safety): in-ride panic alert raised by THIS driver. `safetyActive`
  // flips the EmergencyBar into its "alert raised" state; `safetyAlertIdRef`
  // holds the id returned by the raise so we can stand it down. `safetyBusy`
  // guards the raise/cancel request. `helpVisible` toggles the Help & Support
  // sheet. A `safety:cleared` socket event resets the bar if an admin resolves
  // the alert this device raised.
  const [safetyActive, setSafetyActive] = useState(false);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const safetyAlertIdRef = useRef<string | null>(null);

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

        // v1.0.12: only push when we have a *real* fix. If GPS is still
        // warming up (denied / no signal / first-launch cold start) we
        // skip the tick instead of broadcasting Delhi. Patient UI shows
        // "Locating ambulance…" until the first real fix lands.
        let lat: number | null = null;
        let lng: number | null = null;
        try {
          const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = fix.coords.latitude;
          lng = fix.coords.longitude;
        } catch {
          /* GPS unavailable on this tick — try last-known as a soft fallback */
          try {
            const last = await Location.getLastKnownPositionAsync();
            if (last) {
              lat = last.coords.latitude;
              lng = last.coords.longitude;
            }
          } catch {
            /* ignored */
          }
        }
        if (lat == null || lng == null) return;

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
  // v1.0.11: poll cadence backed off from 5s → 12s. The 5s rhythm caused
  // TripScreen to re-render constantly, which in turn destabilised the
  // OTP input keyboard on ARRIVED (focus loss reported by testers). 12s
  // is fast enough to catch a user cancel within the response window and
  // slow enough to let the OtpInput stay focused while the driver types.
  // v1.0.11.2: also pulls userProfile so the patient card + call button
  // stay populated.
  useEffect(() => {
    const tick = () => {
      bookingsApi.get(booking.id).then((r: any) => {
        setBooking(r.booking);
        if (r.userProfile) setUserProfile(r.userProfile);
      }).catch(() => {});
    };
    tick();
    const id = setInterval(tick, 12000);
    return () => clearInterval(id);
  }, [booking.id]);

  // v1.2.0 (CR#3): listen for the receiving hospital's "acknowledge —
  // preparing" event. The api-server fans this out to the assigned driver's
  // socket as `hospital:preparing` with the booking id; we only react to the
  // event for THIS trip. Listener is cleared on unmount (audit gate item 4).
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const sock = await getSocket();
        if (!mounted) return;
        const onPreparing = (p: { bookingId?: string }) => {
          if (!mounted) return;
          if (!p?.bookingId || p.bookingId === booking.id) setHospitalPreparing(true);
        };
        // v1.3.0 (safety): admin resolved (or we stood down) the safety alert
        // this device raised — reset the EmergencyBar back to idle when the
        // cleared id matches our own alert.
        const onSafetyCleared = (p: { alertId?: string }) => {
          if (!mounted) return;
          if (!p?.alertId || p.alertId !== safetyAlertIdRef.current) return;
          safetyAlertIdRef.current = null;
          setSafetyActive(false);
        };
        sock.on("hospital:preparing", onPreparing);
        sock.on("safety:cleared", onSafetyCleared);
        cleanup = () => {
          sock.off("hospital:preparing", onPreparing);
          sock.off("safety:cleared", onSafetyCleared);
        };
      } catch {
        /* socket bootstrap failed — banner simply won't show; non-critical */
      }
    })();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [booking.id]);

  // CR#6: once picked up, fetch the road route to the (auto-assigned) hospital
  // and auto-launch Google Maps turn-by-turn exactly once. Free OSRM; falls
  // back silently to the haversine ETA if unavailable.
  useEffect(() => {
    if (booking.status !== "PICKED_UP" || booking.dropLat == null || booking.dropLng == null) {
      setNavRoute(null);
      setNavEta(null);
      return;
    }
    if (!autoNavFiredRef.current) {
      autoNavFiredRef.current = true;
      openTurnByTurn(booking.dropLat, booking.dropLng);
    }
    const from = myPos ?? { lat: booking.pickupLat, lng: booking.pickupLng };
    const to = { lat: booking.dropLat, lng: booking.dropLng };
    const controller = new AbortController();
    (async () => {
      const r = await fetchOsrmRoute(from, to, { signal: controller.signal });
      if (r) {
        setNavRoute(r.coords);
        setNavEta({ km: r.distanceKm, min: Math.max(1, Math.round(r.durationMin)) });
      }
    })();
    return () => controller.abort();
    // Not keyed on myPos — one fetch + one auto-launch per PICKED_UP entry.
  }, [booking.status, booking.dropLat, booking.dropLng]);

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

  // v1.3.0 (safety): capture the best location available for a safety raise.
  // Prefer myPos (the 5s GPS ticker already running on this screen), then a
  // fresh fix, then last-known. Final fallback is the booking pickup so the
  // alert always carries a usable location even with GPS cold.
  const safetyLocation = async (): Promise<{ lat: number; lng: number }> => {
    if (myPos) return myPos;
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch {
      /* ignored — fall through to fixes / fallback */
    }
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { lat: fix.coords.latitude, lng: fix.coords.longitude };
    } catch {
      /* try last-known */
    }
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    } catch {
      /* fall through to booking pickup */
    }
    return { lat: booking.pickupLat, lng: booking.pickupLng };
  };

  const raiseSafety = async () => {
    if (safetyBusy) return;
    setSafetyBusy(true);
    try {
      const pos = await safetyLocation();
      const r = await safetyApi.raise(booking.id, pos.lat, pos.lng);
      safetyAlertIdRef.current = r.alert.id;
      setSafetyActive(true);
    } catch (e: any) {
      Alert.alert("Could not send alert", e?.message ?? "Please try again.");
    } finally {
      setSafetyBusy(false);
    }
  };

  const onEmergency = () => {
    Alert.alert(
      "Send a safety alert now?",
      "Your location will be shared with nearby drivers and our team so help can reach you.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send alert", style: "destructive", onPress: () => void raiseSafety() }
      ]
    );
  };

  const onStandDown = async () => {
    const alertId = safetyAlertIdRef.current;
    if (!alertId || safetyBusy) return;
    setSafetyBusy(true);
    try {
      await safetyApi.cancel(alertId);
      safetyAlertIdRef.current = null;
      setSafetyActive(false);
    } catch (e: any) {
      Alert.alert("Could not stand down", e?.message ?? "Please try again.");
    } finally {
      setSafetyBusy(false);
    }
  };

  const finished = ["COMPLETED", "CANCELLED", "TIMED_OUT"].includes(booking.status);
  const failed = ["CANCELLED", "TIMED_OUT"].includes(booking.status);
  const sharing = !finished && ["ACCEPTED", "ARRIVED", "PICKED_UP"].includes(booking.status);
  const stepIndex = statusToIndex(booking.status);

  // v1.0.11.2: removed 90-min gate. Need help banner is always-on during
  // an active trip — testers wanted it one tap away from the moment the
  // ride starts, not buried until 90 min in.

  return (
    <Screen>
      <AppHeader title="Active trip" subtitle={`#${booking.displayId ?? booking.id.slice(0, 8)}`} onBack={onClose} right={<LangToggle />} />

      {/* v1.2.0 (CR#3): hospital has acknowledged & is preparing — reassures
        * the driver the receiving end is ready for the patient. */}
      {!finished && hospitalPreparing ? (
        <Card style={{ borderColor: colors.success, borderWidth: 1, backgroundColor: "rgba(16,185,129,0.08)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <PulseDot size={10} color={colors.success} rings={1} />
            <Text variant="small" weight="semi" tone="success" style={{ flex: 1 }}>
              {t("trip.hospital_preparing_banner")}
            </Text>
          </View>
        </Card>
      ) : null}

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pill label={prettyEmergency(booking.emergencyType)} />
            <StatusBadge status={booking.status} perspective="driver" />
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
            } else if (booking.status === "PICKED_UP" && navEta) {
              // Prefer the OSRM road-based ETA when available (CR#6).
              label = "ETA to hospital";
              value = `~${navEta.min} min · ${navEta.km.toFixed(1)} km`;
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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.sm }}>
          <Text variant="label" tone="secondary">PATIENT &amp; YOU</Text>
          {sharing ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
              <PulseDot size={8} color={colors.success} rings={1} />
              <Text variant="tiny" tone="success" weight="bold">SHARING LIVE</Text>
            </View>
          ) : null}
        </View>
        <MapEmbed
          pickup={{ lat: booking.pickupLat, lng: booking.pickupLng, label: "Patient" }}
          driver={myPos ? { lat: myPos.lat, lng: myPos.lng, label: "You" } : null}
          drop={booking.dropLat != null && booking.dropLng != null
            ? { lat: booking.dropLat, lng: booking.dropLng, label: booking.dropAddress ?? "Hospital" }
            : null}
          routePath={navRoute}
          height={280}
        />
        {myPos && booking.status === "ACCEPTED" ? (
          <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: space.sm }}>
            <View style={{ alignItems: "center" }}>
              <Text variant="tiny" tone="secondary">DISTANCE</Text>
              <Text variant="heading" weight="bold">
                {haversineKm(myPos.lat, myPos.lng, booking.pickupLat, booking.pickupLng).toFixed(1)} km
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text variant="tiny" tone="secondary">ETA</Text>
              <Text variant="heading" weight="bold" tone="primary">
                ~{estimateEtaMin(haversineKm(myPos.lat, myPos.lng, booking.pickupLat, booking.pickupLng))} min
              </Text>
            </View>
          </View>
        ) : null}
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

      {/* v1.0.11.2: Need help section is always-on during an active trip,
        * no 90-min gate. Drivers asked for one-tap support access at any
        * point of the ride, not just after 90 minutes. Hidden only when
        * the trip terminates. */}
      {!finished ? (
        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="danger">NEED HELP?</Text>
            <Text variant="small" tone="secondary">
              Contact support any time during the trip · vehicle issue,
              patient change, can&apos;t reach drop, anything.
            </Text>
            <ContactSupport bookingId={booking.id} compact />
          </View>
        </Card>
      ) : null}

      {/* Patient info card — appears the moment the trip is assigned, mirrors
        * the driver card on the patient side. Driver only sees name + age +
        * gender + phone (one-tap call). Condition / notes / paramedic
        * assessment stay admin-only (team feedback 1.6 + 1.7 explicit
        * visibility rules — driver never reads them back). */}
      {!finished && userProfile ? (
        <Card padding="md">
          <View style={patientCardStyles.row}>
            <View style={patientCardStyles.avatar}>
              <Text variant="heading" weight="bold" style={{ color: colors.primary }}>
                {(booking.patientName ?? userProfile.name ?? "P").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="secondary">PATIENT</Text>
              <Text variant="body" weight="semi">
                {booking.patientName ?? userProfile.name ?? "Patient"}
                {booking.patientAge ? `, ${booking.patientAge}y` : ""}
                {booking.patientGender ? ` · ${booking.patientGender === "M" ? "Male" : booking.patientGender === "F" ? "Female" : "Other"}` : ""}
              </Text>
              <Text variant="tiny" tone="muted">{userProfile.phone}</Text>
            </View>
            <Pressable
              onPress={() => Linking.openURL(`tel:${userProfile.phone}`).catch(() => {})}
              style={patientCardStyles.callBtn}
              accessibilityLabel={`Call ${booking.patientName ?? userProfile.name ?? "patient"}`}
            >
              <Text style={patientCardStyles.callIcon}>📞</Text>
            </Pressable>
          </View>
        </Card>
      ) : null}

      {/* Paramedic assessment — opens after arrival. Records vitals + visible
        * observations + immediate-risk flag. Sent to admin + receiving
        * hospital. NEVER shown back to the driver after submission (team
        * feedback 1.7: medical observations are admin/hospital-only). */}
      {!finished && ["ARRIVED", "PICKED_UP"].includes(booking.status) ? (
        <ParamedicAssessmentCard
          bookingId={booking.id}
          alreadySubmitted={!!booking.paramedicAssessment}
        />
      ) : null}

      {/* SOS flow: drop hospital wasn't set at booking time. On arrival, the
        * driver assesses the patient and captures the drop here. Saved via
        * /set-drop so the patient app immediately sees the destination.
        * Then a Maps deep-link opens Google Maps for turn-by-turn nav. */}
      {!finished && booking.status === "ARRIVED" && !booking.dropAddress ? (
        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="secondary">DROP HOSPITAL (SOS)</Text>
            <Text variant="tiny" tone="muted">
              Capture where the patient needs to go. Saved instantly to the patient app.
            </Text>
            <DropPicker
              bookingId={booking.id}
              defaultLat={booking.pickupLat}
              defaultLng={booking.pickupLng}
              onSaved={(b) => setBooking(b)}
              onMaps={(lat, lng) => openTurnByTurn(lat, lng)}
            />
          </View>
        </Card>
      ) : null}

      {/* OTP verification — required to flip ARRIVED → PICKED_UP. Replaces
        * the legacy 1-tap "Patient picked up" so a driver can't start the
        * meter on a wrong patient by accident. */}
      {!finished && booking.status === "ARRIVED" ? (
        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="secondary">VERIFY RIDE OTP</Text>
            <Text variant="tiny" tone="muted">
              Ask the patient for their 4-digit ride OTP and enter it below.
            </Text>
            <OtpVerify
              onSubmit={async (code) => {
                // No confirm dialog — the empty-strings hack here was causing
                // an empty Alert.alert("","") to flash on submit, which on
                // some Androids killed the keyboard and stranded the driver.
                await advance(() => bookingsApi.pickup(booking.id, code));
              }}
              busy={busy}
            />
          </View>
        </Card>
      ) : null}

      {/* Driver rates the patient after trip completes. Hides once the
        * ratingByDriver column is set. Reuses the shared RatingPrompt card
        * with patient-side copy. */}
      {booking.status === "COMPLETED" ? (
        <RatingPrompt
          title="How was the patient?"
          subtitle="Your rating helps other drivers know what to expect."
          feedbackLabel="Notes for ops (optional)"
          feedbackPlaceholder="e.g., very cooperative, or arrived late"
          submitLabel="Submit rating"
          hidden={!!booking.ratingByDriver}
          onSubmit={async ({ rating, feedback }) => {
            try {
              const r = await bookingsApi.rateByDriver(booking.id, rating, feedback);
              setBooking(r.booking);
            } catch (e: any) {
              Alert.alert("Could not submit", e?.message ?? "Try again.");
            }
          }}
        />
      ) : null}

      {!finished ? (
        <View style={{ gap: space.sm }}>
          {booking.status === "ACCEPTED" ? (
            <Button label="I have arrived" loading={busy} onPress={() => advance(() => bookingsApi.arrived(booking.id))} fullWidth size="lg" testID="arrived-cta" />
          ) : null}
          {booking.status === "PICKED_UP" ? (
            (() => {
              // v1.0.15: SOS bookings arrive without a drop. After the
              // patient is picked up, the driver MUST set the drop hospital
              // on the map before the trip can be marked complete. Normal
              // flow bookings already have dropLat set so this short-circuits.
              const needsDrop = !!booking.isSos && (booking.dropLat == null || booking.dropLng == null);
              return needsDrop ? (
                <>
                  <Card>
                    <View style={{ gap: space.sm }}>
                      <Text variant="label" tone="danger" weight="bold">DROP HOSPITAL REQUIRED</Text>
                      <Text variant="small" tone="secondary">
                        Search a hospital or pin it on the map. The patient app updates the moment you save.
                      </Text>
                      <Button
                        label="Choose drop on map"
                        onPress={() => setDropPickerOpen(true)}
                        fullWidth
                        variant="primary"
                        size="lg"
                      />
                    </View>
                  </Card>
                  <Button
                    label="Drop completed"
                    disabled
                    fullWidth
                    variant="primary"
                    size="lg"
                    testID="complete-cta"
                  />
                  <Text variant="tiny" tone="muted" align="center">
                    Set the drop hospital above to enable this button.
                  </Text>
                </>
              ) : (
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
              );
            })()
          ) : null}
          <Text variant="tiny" tone="muted" align="center">
            Tap the button as you complete each stage.
          </Text>
          {/* v1.2.0 (CR#2): driver can cancel only before pickup (ACCEPTED /
            * ARRIVED). PICKED_UP+ is admin-only. Patient-reason cancels are
            * server-gated by a wait window inside the sheet. */}
          {booking.status === "ACCEPTED" || booking.status === "ARRIVED" ? (
            <Button
              label={t("cancel.cancel_ride")}
              onPress={() => setCancelOpen(true)}
              variant="ghost"
              fullWidth
              testID="cancel-ride-cta"
            />
          ) : null}
        </View>
      ) : (
        <Button label="Back to dashboard" onPress={onClose} fullWidth />
      )}

      {/* v1.3.0 (D2): passive "waiting requests" peek (Ola / Uber style). While
        * the driver is on an active ride they STILL SEE that rides are queued,
        * but Accept is DEFERRED until this ride completes (read-only deferred
        * list). Compact and subordinate to the trip actions above, never a
        * full-screen flash. Polls /driver/incoming plus /driver/sos-pending on a
        * light 8s interval with keep-last-good, cleaning up on unmount. Shown
        * only while the ride is live; on completion the driver returns to the
        * dashboard where the normal list re-enables Accept. */}
      {!finished ? <WaitingRequestsPeek myPos={myPos} /> : null}

      {/* v1.2.0 (CR#2): cancellation sheet. onCancelled fires after the server
        * confirms; the driver is now AVAILABLE so we route back to Dashboard. */}
      {cancelOpen ? (
        <CancelRideSheet
          bookingId={booking.id}
          patientPhone={userProfile?.phone}
          onCancelled={() => {
            setCancelOpen(false);
            onClose();
          }}
          onClose={() => setCancelOpen(false)}
        />
      ) : null}
      {/* v1.3.0 (safety): bottom spacer so the pinned EmergencyBar never hides
        * the last action / cancel button when scrolled to the end. Only while
        * the bar is showing (active ride). */}
      {!finished ? <View style={{ height: 96 }} /> : null}

      {/* v1.0.15: full-screen map picker for SOS drop hospital. Mounted at
        * Screen root so it overlays everything when opened. Cancel = stays
        * gated on the drop card; confirm = POST /set-drop + refresh booking. */}
      <MapLocationPicker
        visible={dropPickerOpen}
        mode="drop"
        initialCenter={
          booking.dropLat != null && booking.dropLng != null
            ? { lat: booking.dropLat, lng: booking.dropLng }
            : myPos
              ? { lat: myPos.lat, lng: myPos.lng }
              : { lat: booking.pickupLat, lng: booking.pickupLng }
        }
        onCancel={() => setDropPickerOpen(false)}
        onConfirm={async (picked) => {
          try {
            const r = await bookingsApi.setDrop(booking.id, picked.lat, picked.lng, picked.address);
            setBooking(r.booking);
            setDropPickerOpen(false);
          } catch (e: any) {
            Alert.alert("Could not save drop", e?.message ?? "Try again.");
          }
        }}
      />

      {/* v1.3.0 (safety): in-ride panic alert bar, pinned to the bottom of the
        * live ride screen while the ride is active (!finished). Rendered in a
        * transparent, touch-through Modal layer so it stays viewport-pinned
        * over the scroll. onEmergency confirms then raises with our live GPS;
        * onStandDown cancels; onHelp opens the Help & Support sheet. */}
      {!finished ? (
        <Modal visible transparent animationType="none" onRequestClose={() => {}}>
          <View style={safetyStyles.barLayer} pointerEvents="box-none">
            <EmergencyBar
              active={safetyActive}
              busy={safetyBusy}
              onEmergency={onEmergency}
              onHelp={() => setHelpVisible(true)}
              onStandDown={() => void onStandDown()}
            />
          </View>
        </Modal>
      ) : null}

      {/* v1.3.0 (safety): Help & Support sheet. Reuses the shared ContactSupport
        * (driver variant) so the in-ride help options (call ops / email) sit one
        * tap behind the bar without changing the always-on help card above. */}
      <Modal visible={helpVisible} transparent animationType="slide" onRequestClose={() => setHelpVisible(false)}>
        <Pressable style={safetyStyles.helpBackdrop} onPress={() => setHelpVisible(false)}>
          <Pressable style={safetyStyles.helpSheet} onPress={() => {}}>
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text variant="label" tone="secondary">HELP &amp; SUPPORT</Text>
                <Pressable onPress={() => setHelpVisible(false)} hitSlop={8}>
                  <Text variant="small" tone="primary" weight="semi">Close</Text>
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled">
                <ContactSupport bookingId={booking.id} variant="driver" />
              </ScrollView>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/**
 * 4-box OTP entry for the driver to verify the patient's ride OTP before
 * starting the trip. Keeps the keypad tight + auto-validates so the driver
 * doesn't have to tap a separate submit.
 */
function OtpVerify({
  onSubmit,
  busy
}: {
  onSubmit: (code: string) => void | Promise<void>;
  busy: boolean;
}) {
  const [code, setCode] = useState("");
  return (
    <View style={{ gap: space.md }}>
      <OtpInput value={code} onChangeText={setCode} length={4} autoFocus />
      <Button
        label="Start ride"
        loading={busy}
        disabled={code.length !== 4}
        onPress={() => onSubmit(code)}
        fullWidth
        size="lg"
        testID="pickup-cta"
      />
      <Text variant="tiny" tone="muted" align="center">
        The patient can see this code on their app. Ask them to read it out.
      </Text>
    </View>
  );
}

/**
 * Lightweight drop-hospital input. The driver types the name + optionally a
 * lat/lng (defaulting to pickup, since SOS hospitals are usually near). On
 * "Set drop" we PATCH the booking via /set-drop so the patient app starts
 * showing the destination immediately, and then offer a Google Maps button
 * to navigate. A full map picker arrives in a later iteration.
 */
function DropPicker({
  bookingId,
  defaultLat,
  defaultLng,
  onSaved,
  onMaps
}: {
  bookingId: string;
  defaultLat: number;
  defaultLng: number;
  onSaved: (b: Booking) => void;
  onMaps: (lat: number, lng: number) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = async () => {
    const label = name.trim();
    if (!label) return;
    setBusy(true);
    try {
      const r = await bookingsApi.setDrop(bookingId, defaultLat, defaultLng, label);
      onSaved(r.booking);
      setSavedAt(Date.now());
    } catch (e: any) {
      Alert.alert("Could not save drop", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space.sm }}>
      <Input
        label="Hospital name"
        value={name}
        onChangeText={setName}
        placeholder="e.g., Apollo Indraprastha"
        autoCapitalize="words"
      />
      <Button
        label={savedAt ? "Drop saved · update" : "Save drop hospital"}
        onPress={save}
        loading={busy}
        disabled={!name.trim()}
        fullWidth
        variant={savedAt ? "outline" : "primary"}
      />
      {savedAt ? (
        <Button
          label="Open in Google Maps"
          variant="ghost"
          onPress={() => onMaps(defaultLat, defaultLng)}
          fullWidth
        />
      ) : null}
      <Text variant="tiny" tone="muted">
        Tip: the patient app updates the moment you save this.
      </Text>
    </View>
  );
}

/**
 * Paramedic assessment form. Driver fills after arrival; on submit the
 * card collapses into a "Submitted ✓" confirmation. The driver app
 * intentionally never re-displays the values back — once sent, the
 * record lives only in the admin/hospital views (privacy rule from
 * team feedback 1.7).
 */
function ParamedicAssessmentCard({ bookingId, alreadySubmitted }: { bookingId: string; alreadySubmitted: boolean }) {
  const [open, setOpen] = useState(!alreadySubmitted);
  const [submitted, setSubmitted] = useState(alreadySubmitted);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Local form state — single source of truth, never read back from server.
  const [consciousness, setConsciousness] = useState<string | null>(null);
  const [breathing, setBreathing] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [bleeding, setBleeding] = useState<string | null>(null);
  const [immediateRisk, setImmediateRisk] = useState(false);
  const [notes, setNotes] = useState("");

  if (submitted && !open) {
    return (
      <Card flat>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="secondary">PARAMEDIC ASSESSMENT</Text>
            <Text variant="small" tone="success">Submitted · sent to medical team</Text>
          </View>
          <Pressable onPress={() => setOpen(true)}>
            <Text variant="small" tone="primary" weight="semi">Update</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await bookingsApi.paramedicAssessment(bookingId, {
        consciousness: consciousness ?? undefined,
        breathing: breathing ?? undefined,
        pulse: pulse ?? undefined,
        bleedingSeverity: bleeding ?? undefined,
        immediateRisk,
        notes: notes || undefined
      });
      setSubmitted(true);
      setOpen(false);
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
          <Text variant="label" tone="primary">PARAMEDIC ASSESSMENT</Text>
          <Text variant="tiny" tone="secondary">
            Quick patient vitals. Goes to the medical team + receiving hospital. Not visible back here once submitted.
          </Text>
        </View>

        <ChipRow label="Consciousness" options={["alert", "responsive_to_voice", "responsive_to_pain", "unconscious"]} value={consciousness} onChange={setConsciousness} pretty={prettyConsciousness} />
        <ChipRow label="Breathing" options={["normal", "laboured", "shallow", "absent"]} value={breathing} onChange={setBreathing} />
        <ChipRow label="Pulse" options={["normal", "weak", "rapid", "absent"]} value={pulse} onChange={setPulse} />
        <ChipRow label="Bleeding" options={["none", "minor", "moderate", "severe"]} value={bleeding} onChange={setBleeding} />

        <Pressable
          onPress={() => setImmediateRisk((v) => !v)}
          style={[paramedicStyles.riskRow, immediateRisk ? paramedicStyles.riskOn : null]}
        >
          <Text variant="body" weight="semi" style={{ color: immediateRisk ? colors.textInverse : colors.textPrimary }}>
            🚨 Immediate risk to life
          </Text>
          <Text variant="tiny" style={{ color: immediateRisk ? colors.textInverse : colors.textMuted }}>
            {immediateRisk ? "FLAGGED" : "Tap to flag"}
          </Text>
        </Pressable>

        <Input
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything the hospital should know on arrival"
          multiline
        />

        {err ? <Text variant="tiny" tone="danger">{err}</Text> : null}
        <Button
          label={busy ? "Sending…" : alreadySubmitted ? "Update assessment" : "Send to medical team"}
          onPress={submit}
          loading={busy}
          fullWidth
        />
      </View>
    </Card>
  );
}

function ChipRow({
  label,
  options,
  value,
  onChange,
  pretty
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  pretty?: (v: string) => string;
}) {
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label" tone="secondary">{label}</Text>
      <View style={paramedicStyles.chipRow}>
        {options.map((o) => {
          const sel = value === o;
          return (
            <Pressable
              key={o}
              onPress={() => onChange(o)}
              style={[paramedicStyles.chip, sel ? paramedicStyles.chipOn : null]}
            >
              <Text variant="tiny" weight={sel ? "bold" : "regular"} style={{ color: sel ? colors.textInverse : colors.textPrimary }}>
                {(pretty ?? defaultPretty)(o)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function defaultPretty(v: string) { return v.charAt(0).toUpperCase() + v.slice(1); }
function prettyConsciousness(v: string) {
  switch (v) {
    case "alert": return "Alert";
    case "responsive_to_voice": return "Responds to voice";
    case "responsive_to_pain": return "Responds to pain";
    case "unconscious": return "Unconscious";
    default: return v;
  }
}

const paramedicStyles = StyleSheet.create({
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  riskRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border
  },
  riskOn: { backgroundColor: colors.danger, borderColor: colors.danger }
});

const safetyStyles = StyleSheet.create({
  // Touch-through layer that pins the EmergencyBar to the viewport bottom over
  // the scrolling trip content. box-none lets taps pass through everywhere
  // except the bar itself (which captures its own button presses).
  barLayer: {
    flex: 1,
    justifyContent: "flex-end"
  },
  helpBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end"
  },
  helpSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    maxHeight: "80%"
  }
});

const patientCardStyles = StyleSheet.create({
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
