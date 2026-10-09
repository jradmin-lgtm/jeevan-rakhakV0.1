import { rideCache } from "../rideCache";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import {
  AppHeader,
  Button,
  Card,
  ContactSupport,
  Input,
  MapEmbed,
  MotionView,
  OtpToast,
  Pill,
  PulseDot,
  RatingPrompt,
  Screen,
  StatusBadge,
  Text,
  colors,
  radius,
  space,
  useRideRoute,
  newerFix,
  remainingRoute,
  dialog
} from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { getSocket } from "../socket";
import { prettyEmergency } from "./HomeScreen";
import { useT } from "../i18n";
import { useMapConfig } from "../useMapConfig";

type DriverProfile = {
  id: string;
  name?: string | null;
  phone: string;
  vehicleNumber?: string | null;
  vehicleType?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
};

type DriverPosition = { lat: number; lng: number; lastSeenAt?: string | null };

function openOnGoogleMaps(lat: number, lng: number) {
  // Universal Google Maps URL — opens native app if installed, browser
  // otherwise. No Maps API key needed, no quota cost.
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  Linking.openURL(url).catch(error => { console.error("Map link could not open", error); void dialog.alert("Maps / मानचित्र", "Could not open maps. Please try again. / मानचित्र नहीं खुल सका। कृपया दोबारा कोशिश करें।"); });
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

// 2026-08-12: proper duration scale (was raw "M:SS" / raw seconds forever) —
// seconds alone under a minute, then whole minutes, then hours + minutes.
// Used for both the elapsed/searching timer and the "LIVE · Xs ago" badge.
function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

type Props = {
  booking: Booking;
  onClose: () => void;
  /** v1.0.15: called when SOS booking completes and still has paidAt=null —
   *  parent navigates to PaymentScreen for coupon + Mark paid. Normal flow
   *  bookings (auto-marked-paid at /complete) bypass this and just show the
   *  rating prompt below. */
  onPayment?: (booking: Booking) => void;
};

export function LiveTrackingScreen({ booking: initial, onClose, onPayment }: Props) {
  const { t, lang } = useT();
  // CR3 (2026-08): the socket-handler effect below only depends on
  // [initial.id] (handlers are wired once per booking), so a plain closure
  // over `t` would go stale if the user switches language mid-ride. This ref
  // always holds the latest translate fn for those long-lived callbacks.
  const tRef = useRef(t);
  tRef.current = t;
  const mapCfg = useMapConfig();
  const [renderedProvider, setRenderedProvider] = useState<"google" | "osm" | null>(null);
  useEffect(() => setRenderedProvider(null), [mapCfg.provider, mapCfg.googleBrowserKey]);
  const [booking, setBooking] = useState<Booking>(initial);
  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number; ts: number } | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  // v1.1.0 (CR#3): real road route + ETA to the destination hospital, drawn
  // once the patient is picked up. Free OSRM; null until fetched / on failure
  // (we then fall back to the straight-line haversine ETA).
  const { path: navRoute, estimate: routeEstimate, source: routeSource, cacheError: routeCacheError } = useRideRoute(booking, driverPos, renderedProvider ?? mapCfg.provider, rideCache, bookingsApi.liveEta);
  const navEta = remainingRoute(navRoute, driverPos, routeEstimate);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStatusRef = useRef<string>(initial.status);


  const [rideCacheError, setRideCacheError] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    let active = true;
    void rideCache.load().then(snapshot => {
      if (!active || snapshot?.booking.id !== initial.id) return;
      if (snapshot.contact) setDriverProfile(snapshot.contact as DriverProfile);
      if (snapshot.position) setDriverPos(current => current && current.ts > snapshot.position!.ts ? current : snapshot.position!);
    }).catch(error => { console.error("[ride] restore failed", error); if (active) setRideCacheError(true); })
      .finally(() => { if (active) setRestored(true); });
    return () => { active = false; };
  }, [initial.id]);
  useEffect(() => {
    if (!restored) return;
    void rideCache.saveBooking(booking).catch(error => { console.error("[ride] save failed", error); setRideCacheError(true); });
  }, [booking, restored]);
  useEffect(() => {
    if (!restored) return;
    void rideCache.saveDetails(booking.id, { contact: driverProfile, position: driverPos }).catch(error => { console.error("[ride] detail save failed", error); setRideCacheError(true); });
  }, [booking.id, driverProfile, driverPos, restored]);

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
        setToast(t("live.driver_assigned"));
      } else if (booking.status === "ARRIVED") {
        setToast(t("live.toast_driver_arrived"));
      } else if (booking.status === "PICKED_UP") {
        setToast(t("live.toast_pickup_confirmed"));
      } else if (booking.status === "COMPLETED") {
        setToast(t("live.toast_trip_completed"));
      }
      lastStatusRef.current = booking.status;
    }
  }, [booking.status]);

  // v1.0.15: route SOS bookings to the post-completion payment screen as
  // soon as the driver marks the trip complete. Normal flow auto-pays at
  // /complete (paidAt is set server-side) so this branch never fires for
  // non-SOS rides. Re-checks on every booking refresh so we catch the
  // transition coming via either poll or socket.
  const navigatedToPayRef = useRef(false);
  useEffect(() => {
    if (navigatedToPayRef.current) return;
    if (!onPayment) return;
    if (booking.status !== "COMPLETED") return;
    if (!booking.isSos) return;
    if (booking.paidAt) return;
    navigatedToPayRef.current = true;
    onPayment(booking);
  }, [booking, onPayment]);

  // v1.1.0 (CR#3): once picked up, fetch the road route to the destination
  // hospital (auto-assigned server-side at pickup). Falls back silently to
  // the straight-line haversine ETA if OSRM is unavailable.
  //
  // 2026-08-12 fix: this used to fetch ONCE per PICKED_UP entry and never
  // again, so the drawn polyline stayed anchored to wherever the driver was
  // at the moment of pickup while the live driver marker kept moving —
  // zoomed out, the two visibly drifted apart ("points vs path look
  // misaligned"). Now it refetches every 30s from the driver's CURRENT
  // position via a ref (not a dependency, so this doesn't refire on every
  // 5s position tick — just re-reads the latest one on its own timer).


  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;

    // Centralised refresh: pulls booking + driver profile + last-known driver
    // position. Used by both the 5s poll and the socket booking:event handler.
    // The driver position from this endpoint is the *fallback* — if socket
    // relay drops (free-tier dyno sleep, transient network), the user still
    // sees the ambulance move within 5 seconds.
    let refreshRunning = false;
    const refreshFromApi = async () => {
      if (refreshRunning) return;
      refreshRunning = true;
      try {
        const r: any = await bookingsApi.get(initial.id);
        if (!mounted) return;
        setBooking(r.booking);
        setTrackingError(null);
        if (r.driverProfile) setDriverProfile(r.driverProfile);
        // Only apply the polled driver position if the live socket stream
        // hasn't given us anything fresher (<15s old). This keeps the marker
        // bumping smoothly when the socket IS working.
        const pollPos = r.driverPosition;
        if (pollPos && pollPos.lat != null && pollPos.lng != null) {
          const ts = pollPos.lastSeenAt ? new Date(pollPos.lastSeenAt).getTime() : NaN;
          setDriverPos((current) => newerFix(current, { lat: pollPos.lat, lng: pollPos.lng, ts }));
        }
      } catch (err) {
        console.warn("[tracking] booking refresh failed", err);
        if (mounted) setTrackingError(t("live.refresh_failed"));
      } finally { refreshRunning = false; }
    };

    void refreshFromApi();
    pollRef.current = setInterval(refreshFromApi, 5000);
    (async () => {
      const sock = await getSocket();
      if (!mounted) return;
      const listeners: Array<[string, (payload: any) => void]> = [];
      const listen = (event: string, handler: (payload: any) => void) => {
        const guarded = (payload: any) => { if (mounted) handler(payload); };
        listeners.push([event, guarded]); sock.on(event, guarded);
      };
      const subscribe = () => { sock.emit("booking:subscribe", { bookingId: initial.id }); void refreshFromApi(); };
      listen("connect", subscribe); subscribe();
      listen("booking:event", (msg: any) => {
        if (msg.bookingId !== initial.id) return;
        void refreshFromApi();
      });
      listen("driver:location:update", (loc: any) => {
        if (loc.bookingId !== initial.id) return;
        // Socket update wins — always overwrite (it's the freshest signal).
        setDriverPos((current) => newerFix(current, { lat: loc.lat, lng: loc.lng, ts: loc.ts }));
      });
      // v1.0.15: SOS-specific events from the cascade engine.
      listen("sos:assigned", (p: any) => {
        if (p?.bookingId !== initial.id) return;
        setToast(t("live.driver_assigned"));
        void refreshFromApi();
      });
      listen("sos:cascade_exhausted", (p: any) => {
        if (p?.bookingId !== initial.id) return;
        setToast(t("live.toast_cascade_exhausted"));
      });
      // v1.2.0 (CR#2): driver-initiated cancellation outcomes. CLOSED → the
      // ride is cancelled (patient must re-request); RE_DISPATCHED → we're
      // finding another ambulance (booking goes back to REQUESTED, no re-book).
      // p?.message is the server's (English-only, see push-i18n.ts scope note)
      // socket toast text — only used if our own localized fallback can't apply.
      listen("booking:cancelled", (p: any) => {
        if (p?.bookingId !== initial.id) return;
        setToast(p?.message ?? t("live.toast_booking_closed"));
        void refreshFromApi();
      });
      listen("booking:reassigning", (p: any) => {
        if (p?.bookingId !== initial.id) return;
        setToast(p?.message ?? t("live.toast_reassigning"));
        void refreshFromApi();
      });

      cleanup = () => { for (const [event, handler] of listeners) sock.off(event, handler); sock.emit("booking:unsubscribe", { bookingId: initial.id }); };
      void refreshFromApi();

    })().catch((err) => { console.warn("[tracking] socket bootstrap failed", err); if (mounted) setTrackingError(t("live.refresh_failed")); });

    return () => {
      mounted = false;
      cleanup?.();
      if (pollRef.current) clearInterval(pollRef.current);

    };
  }, [initial.id]);

  const onCancel = async () => {
    if (
      !(await dialog.confirm({
        title: t("live.cancel_dialog_title"),
        message:
          booking.status === "REQUESTED"
            ? t("live.cancel_dialog_no_driver")
            : t("live.cancel_dialog_driver_assigned"),
        confirmText: t("live.cancel_booking"),
        cancelText: t("live.keep_booking"),
        destructive: true
      }))
    ) {
      return;
    }
    try {
      await bookingsApi.cancel(initial.id);
      onClose();
    } catch (e: any) {
      // Server returns 409 cannot_cancel once the patient has been
      // picked up — they're already in the ambulance. Surface a
      // human-readable message instead of the raw error code.
      const msg = String(e?.message ?? "").toLowerCase();
      if (msg.includes("cannot_cancel")) {
        void dialog.alert(t("live.already_in_progress_title"), t("live.already_in_progress_body"));
      } else {
        void dialog.alert(t("live.cancel_error_title"), e?.message ?? t("common.please_try_again"));
      }
    }
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
  const stalePosition = !!driverPos && nowTs - driverPos.ts > 30_000;
  const savedEstimate = routeSource === "cached" || stalePosition;
  let timerLabel = "";
  let timerValue = "";
  if (booking.status === "REQUESTED") {
    // v1.0.15: SOS bookings cascade through drivers one wave at a time (60s
    // each). Label reflects the expanding search so the patient doesn't
    // think the app is just spinning.
    timerLabel = booking.isSos ? t("live.searching_title") : t("live.looking_for_driver");
    timerValue = formatDuration(elapsedSec);
  } else if (booking.status === "ACCEPTED" && driverPos) {
    const km = haversineKm(driverPos.lat, driverPos.lng, booking.pickupLat, booking.pickupLng);
    timerLabel = t(savedEstimate ? "live.saved_eta" : "live.timer_driver_arrives_in");
    timerValue = (navEta?.min ?? estimateEtaMin(km)) < 1 ? "<1 min" : `~${Math.round(navEta?.min ?? estimateEtaMin(km))} min`;
  } else if (booking.status === "ARRIVED") {
    timerLabel = t("live.timer_driver_waiting");
    timerValue = t("live.timer_at_pickup");
  } else if (booking.status === "PICKED_UP" && navEta) {
    // Prefer the OSRM road-based ETA when we have it (CR#3).
    timerLabel = t(savedEstimate ? "live.saved_eta" : "live.timer_hospital_eta");
    timerValue = navEta.min < 1 ? "<1 min" : `~${Math.round(navEta.min)} min`;
  } else if (booking.status === "PICKED_UP" && driverPos && booking.dropLat != null && booking.dropLng != null) {
    const km = haversineKm(driverPos.lat, driverPos.lng, booking.dropLat, booking.dropLng);
    timerLabel = t(savedEstimate ? "live.saved_eta" : "live.timer_hospital_eta");
    timerValue = `~${estimateEtaMin(km)} min`;
  } else if (booking.status === "PICKED_UP") {
    timerLabel = t("live.timer_enroute");
    timerValue = formatDuration(elapsedSec);
  }

  // 2026-08-12: the map card's DISTANCE/ETA used to always target the pickup
  // point, even after pickup — once the driver had the patient and was en
  // route to the hospital, this showed distance-to-a-point-they'd-already-
  // reached (~0.0 km, ~1 min), which read as broken. Now it switches phase
  // like Ola/Uber: before pickup, target is the pickup point; after pickup,
  // target is the destination hospital. Prefers the OSRM road distance/ETA
  // (navEta) when available, matching the top status card's logic.
  const pastPickup = booking.status === "PICKED_UP" && booking.dropLat != null && booking.dropLng != null;
  const mapTargetLat = pastPickup ? booking.dropLat! : booking.pickupLat;
  const mapTargetLng = pastPickup ? booking.dropLng! : booking.pickupLng;
  const mapDistanceKm = driverPos
    ? (navEta ? navEta.km : haversineKm(driverPos.lat, driverPos.lng, mapTargetLat, mapTargetLng))
    : null;
  const mapEtaMin = driverPos
    ? (navEta ? navEta.min : estimateEtaMin(haversineKm(driverPos.lat, driverPos.lng, mapTargetLat, mapTargetLng)))
    : null;

  return (
    <Screen bg={colors.surface} header={<AppHeader title={t("live.screen_title")} subtitle={t("payment.booking_number").replace("{id}", String(booking.displayId ?? booking.id.slice(0, 8)))} onBack={onClose} />}
      footer={driverProfile && !finished && booking.status !== "REQUESTED" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="body" weight="bold">{driverProfile.name ?? t("live.driver_fallback_name")}</Text>
            <Text variant="small" tone="secondary">{driverProfile.vehicleNumber ?? t("live.vehicle_pending")}{driverProfile.vehicleType ? ` · ${driverProfile.vehicleType}` : ""}</Text>
            {(driverProfile.ratingCount ?? 0) > 0 && driverProfile.rating != null ? <Text variant="tiny" tone="secondary">{driverProfile.rating.toFixed(1)} / 5</Text> : null}
          </View>
          <Button label={lang === "hi" ? "कॉल करें" : "Call driver"} variant="secondary"
            onPress={() => { void Linking.openURL(`tel:${driverProfile.phone}`).catch(error => { console.error("Driver call could not open", error); void dialog.alert(lang === "hi" ? "कॉल नहीं हो सकी" : "Could not open phone", driverProfile.phone); }); }} />
        </View>
      ) : undefined}>
      {rideCacheError || routeCacheError ? <Text variant="small" tone="danger" accessibilityRole="alert">{t("offline.storage_error")}</Text> : null}
      {trackingError ? <Text variant="small" tone="danger" accessibilityRole="alert">{trackingError}</Text> : null}
      {driverPos && nowTs - driverPos.ts > 30_000 ? <Text variant="small" tone="danger">{t("live.location_stale")}</Text> : null}
      <MotionView changeKey={booking.status}>
      <Card flat>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Pill label={prettyEmergency(booking.emergencyType, t)} />
            <StatusBadge label={t(`status.${booking.status}`)} status={booking.status} />
          </View>
          <Text variant="heading" weight="bold">{statusHeadline(booking.status, t)}</Text>
          <Text variant="small" tone="secondary">{statusSubline(booking.status, t)}</Text>
          {timerLabel ? (
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
              <Text variant="small" tone="secondary">{timerLabel}</Text>
              <Text variant="heading" weight="bold" tone="primary">{timerValue}</Text>
            </View>
          ) : null}
        </View>
      </Card>
      </MotionView>

      <Card flat padding="sm">
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="label" tone="secondary">
              {driverPos ? t(stalePosition ? "live.last_known_location" : "live.driver_live_label") : t("live.pickup_label")}
            </Text>
            {driverPos && nowTs - driverPos.ts <= 30_000 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <PulseDot size={8} color={colors.success} rings={1} />
                <Text variant="tiny" tone="success" weight="bold">
                  {t("live.live_seconds_ago").replace("{time}", formatDuration((Date.now() - driverPos.ts) / 1000))}
                </Text>
              </View>
            ) : null}
          </View>
          <MapEmbed
            pickup={{ lat: booking.pickupLat, lng: booking.pickupLng, label: t("live.pin_pickup") }}
            driver={driverPos ? { lat: driverPos.lat, lng: driverPos.lng, label: t("live.pin_driver") } : null}
            drop={booking.dropLat != null && booking.dropLng != null
              ? { lat: booking.dropLat, lng: booking.dropLng, label: booking.dropAddress ?? t("live.pin_hospital_fallback") }
              : null}
            routePath={navRoute}
          routeProvider={routeSource === "traffic" ? "google" : "osm"}
          onProviderChange={setRenderedProvider}
          mapConfig={mapCfg}
            height={300}
          />
          <Text variant="tiny" tone="muted">{t(`live.route_${routeSource}`)}</Text>
          {driverPos && mapDistanceKm != null && mapEtaMin != null ? (
            <View style={{ flexDirection: "row", justifyContent: "space-around", paddingVertical: space.xs }}>
              <View style={{ alignItems: "center" }}>
                <Text variant="tiny" tone="secondary">{t("live.distance_label")}</Text>
                <Text variant="heading" weight="bold">
                  {mapDistanceKm.toFixed(1)} km
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text variant="tiny" tone="secondary">{t(savedEstimate ? "live.saved_eta" : "live.eta_label")}</Text>
                <Text variant="heading" weight="bold" tone="primary">
                  {mapEtaMin < 1 ? "<1 min" : `~${Math.round(mapEtaMin)} min`}
                </Text>
              </View>
            </View>
          ) : (
            <Text variant="tiny" tone="muted" align="center" style={{ paddingVertical: space.xs }}>
              {t("live.map_waiting_hint")}
            </Text>
          )}
          <Button
            label={t("live.open_google_maps")}
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

      {/* Ride OTP : visible from the moment the booking is created so the
        * patient can rehearse the code. Goes prominently red once the driver
        * has actually arrived ("Tell this code to the driver"). Disappears
        * after PICKED_UP since the OTP has been consumed.
        *
        * v1.0.15: wrapped in an explicit-margin View so the OTP card never
        * visually butts up against the map card below it. ScrollView's
        * contentContainerStyle `gap` is unreliable across RN/Android paths;
        * explicit marginBottom is the safe default. Plus `includeFontPadding:
        * false` + slightly tighter letterSpacing kill the residual Android
        * vertical-clip on the 4-digit code. */}
      {booking.rideOtpCode && ["REQUESTED", "ACCEPTED", "ARRIVED"].includes(booking.status) ? (
        <View style={{ marginBottom: space.lg }}>
          <Card style={
            booking.status === "ARRIVED"
              ? { borderColor: colors.primary, borderWidth: 2, backgroundColor: "#FFF5F4" }
              : undefined
          }>
            <View style={{ gap: space.sm, alignItems: "center" }}>
              <Text variant="label" tone={booking.status === "ARRIVED" ? "danger" : "secondary"}>
                {booking.status === "ARRIVED" ? t("live.otp_tell_driver_label") : t("live.otp_label")}
              </Text>
              <Text style={{
                fontSize: 44,
                fontWeight: "700",
                color: colors.primary,
                letterSpacing: 6,
                textAlign: "center",
                includeFontPadding: false,
                lineHeight: 52,
                paddingHorizontal: space.md
              }}>
                {booking.rideOtpCode}
              </Text>
              <Text variant="tiny" tone="muted" align="center">
                {t("live.otp_explainer")}
              </Text>
            </View>
          </Card>
        </View>
      ) : null}


      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("live.pickup_label")}</Text>
          <Text variant="body">{booking.pickupAddress ?? `${booking.pickupLat.toFixed(4)}, ${booking.pickupLng.toFixed(4)}`}</Text>
          {booking.dropAddress ? (
            <>
              <Text variant="label" tone="secondary">
                {booking.destHospitalId || booking.status === "PICKED_UP" ? t("live.destination_hospital_label") : t("live.drop_label")}
              </Text>
              <Text variant="body">{booking.dropAddress}</Text>
            </>
          ) : null}
          {/* Fare block. Shows the *payable* amount as the headline so the
            * patient never sees "₹250" when the coupon brings it to ₹0 : a
            * recurring confusion in v1.0.11 testing. Estimate + coupon line
            * stays as small print for transparency. */}
          {booking.fareEstimateInr != null || booking.payableInr != null ? (() => {
            const estimate = booking.fareEstimateInr ?? booking.fareFinalInr ?? 0;
            const payable = booking.payableInr ?? booking.fareFinalInr ?? estimate;
            const discounted = payable < estimate;
            return (
              <>
                <Text variant="label" tone="secondary">{t("live.you_pay")}</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                  <Text variant="heading" weight="bold" tone={payable === 0 ? "success" : undefined}>
                    {payable === 0 ? t("live.free_label") : `₹${payable}`}
                  </Text>
                  {discounted ? (
                    <Text variant="small" tone="muted" style={{ textDecorationLine: "line-through" }}>
                      ₹{estimate}
                    </Text>
                  ) : null}
                </View>
                {booking.couponCode ? (
                  <Text variant="tiny" tone="success">
                    {t("live.coupon_applied_saved").replace("{code}", booking.couponCode).replace("{amount}", String(Math.max(0, estimate - payable)))}
                  </Text>
                ) : (
                  <Text variant="tiny" tone="muted">{t("live.cashless_hint")}</Text>
                )}
              </>
            );
          })() : null}
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
        && !(booking.patientConditions && booking.patientConditions.length > 0)
        ? (
          <PatientInfoCard
            bookingId={booking.id}
            onSaved={(b) => setBooking((curr) => ({ ...curr, ...b }))}
          />
        ) : null}

      {/* Patient rates the driver after the trip completes. The card hides
        * as soon as booking.rating is set so we don't double-prompt on
        * re-poll. Reuses the shared RatingPrompt with driver-facing copy. */}
      {booking.status === "COMPLETED" ? (
        <RatingPrompt
          title={t("live.rating_title")}
          subtitle={t("live.rating_subtitle")}
          feedbackLabel={t("live.rating_feedback_label")}
          feedbackPlaceholder={t("live.rating_feedback_placeholder")}
          submitLabel={t("live.rating_submit")}
          hidden={!!booking.rating}
          onSubmit={async ({ rating, feedback }) => {
            try {
              const r = await bookingsApi.rate(initial.id, rating, feedback);
              setBooking(r.booking);
            } catch (e: any) {
              void dialog.alert(t("live.rating_error_title"), e?.message ?? t("common.try_again_short"));
            }
          }}
        />
      ) : null}

      {/* v1.0.11.2: always-on Need help section during an active trip. */}
      {!finished ? (
        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="danger">{t("live.need_help_label")}</Text>
            <Text variant="small" tone="secondary">
              {t("live.need_help_body")}
            </Text>
            <ContactSupport lang={lang} bookingId={booking.id} compact />
          </View>
        </Card>
      ) : null}

      {!finished ? (
        cancellable ? (
          <Button label={t("live.cancel_booking")} variant="outline" onPress={onCancel} fullWidth />
        ) : (
          <Text variant="tiny" tone="muted" align="center">
            {t("live.trip_in_progress_note")}
          </Text>
        )
      ) : (
        <Button label={t("common.done")} onPress={onClose} fullWidth />
      )}

      <OtpToast message={toast} onHide={() => setToast(null)} />

    </Screen>
  );
}

// Emergency categories from team feedback 1.6 (dropdown). Mapped to the
// patient_condition text column server-side. Driver app never reads this.
const EMERGENCY_CONDITIONS = [
  "Road Accident",
  "Trauma · Firearm",
  "Trauma · Sharp Object",
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
  const { t } = useT();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [attendantName, setAttendantName] = useState("");
  const [attendantRelation, setAttendantRelation] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "O" | null>(null);
  // 2026-08-12: multi-select — a patient can be e.g. both "Road Accident"
  // AND "Severe Bleeding" at once.
  const [conditions, setConditions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleCondition = (c: string) => {
    setConditions((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const submit = async () => {
    if (conditions.length === 0) {
      setErr(t("live.patient_condition_required"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const ageNum = age ? parseInt(age, 10) : undefined;
      const r = await bookingsApi.patientInfo(bookingId, {
        attendantName: attendantName.trim() || undefined,
        attendantRelation: attendantRelation.trim() || undefined,
        patientName: name || undefined,
        patientAge: Number.isFinite(ageNum) ? ageNum : undefined,
        patientGender: gender ?? undefined,
        patientConditions: conditions,
        patientNotes: notes || undefined
      });
      onSaved(r.booking);
    } catch (e: any) {
      setErr(e?.message ?? t("live.patient_save_error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderColor: colors.primary, borderWidth: 1 }}>
      <View style={{ gap: space.md }}>
        <View>
          <Text variant="label" tone="primary">{t("live.patient_details_label")}</Text>
          <Text variant="tiny" tone="secondary">
            {t("live.patient_details_note")}
          </Text>
        </View>

        <View style={patientStyles.condGrid}>
          {EMERGENCY_CONDITIONS.map((c) => {
            const selected = conditions.includes(c);
            return (
              <Pressable
                key={c}
                onPress={() => toggleCondition(c)}
                style={[patientStyles.chip, selected ? patientStyles.chipActive : null]}
              >
                <Text variant="tiny" weight={selected ? "bold" : "regular"} style={{ color: selected ? colors.textInverse : colors.textPrimary }}>
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Input label={t("live.attendant_name")} value={attendantName} onChangeText={setAttendantName} />
        <Input label={t("live.attendant_relation")} value={attendantRelation} onChangeText={setAttendantRelation} />
        <Input
          label={t("live.patient_name_label")}
          value={name}
          onChangeText={setName}
          placeholder={t("live.patient_name_placeholder")}
        />
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Input label={t("live.patient_age_label")} value={age} onChangeText={setAge} keyboardType="number-pad" placeholder={t("live.optional_placeholder")} />
          </View>
          <View style={{ flex: 1.4, gap: 4 }}>
            <Text variant="label" tone="secondary">{t("live.patient_gender_label")}</Text>
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
                      {g === "M" ? t("live.gender_male") : g === "F" ? t("live.gender_female") : t("live.gender_other")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
        <Input
          label={t("live.patient_notes_label")}
          value={notes}
          onChangeText={setNotes}
          placeholder={t("live.patient_notes_placeholder")}
          multiline
        />
        {err ? <Text variant="tiny" tone="danger">{err}</Text> : null}
        <Button
          label={busy ? t("live.sending") : t("live.send_to_medical_team")}
          onPress={submit}
          loading={busy}
          disabled={conditions.length === 0}
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

function statusHeadline(status: string, t: (key: string) => string): string {
  switch (status) {
    case "REQUESTED": return t("live.status_headline.requested");
    case "ACCEPTED": return t("live.status_headline.accepted");
    case "ARRIVED": return t("live.toast_driver_arrived");
    case "PICKED_UP": return t("live.status_headline.picked_up");
    case "COMPLETED": return t("live.toast_trip_completed");
    case "CANCELLED": return t("live.status_headline.cancelled");
    case "TIMED_OUT": return t("live.cascade_exhausted_title");
    default: return status;
  }
}

function statusSubline(status: string, t: (key: string) => string): string {
  switch (status) {
    case "REQUESTED": return t("live.status_subline.requested");
    case "ACCEPTED": return t("live.status_subline.accepted");
    case "ARRIVED": return t("live.status_subline.arrived");
    case "PICKED_UP": return t("live.status_subline.picked_up");
    case "COMPLETED": return t("live.status_subline.completed");
    case "CANCELLED": return t("live.status_subline.cancelled");
    case "TIMED_OUT": return t("live.status_subline.timed_out");
    default: return "";
  }
}
