import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, RefreshControl, View } from "react-native";
import * as Location from "expo-location";
import {
  AppHeader,
  Button,
  Card,
  EmptyState,
  IconBadge,
  Pill,
  PulseDot,
  Screen,
  Skeleton,
  StatusBadge,
  Text,
  colors,
  dialog,
  space,
  useFadeIn
} from "@jr/ui";
import {
  Booking,
  bookings as bookingsApi,
  clearToken,
  driver as driverApi,
  incoming as incomingApi,
  IncomingRequest,
  me,
  safety as safetyApi,
  SafetyActiveAlert
} from "../api";
import { getSocket, disconnectSocket } from "../socket";
import { useDriverHeartbeat } from "../hooks/useDriverHeartbeat";
import { SosIncomingModal } from "../components/SosIncomingModal";
import { SafetyAlertCard } from "../components/SafetyAlertCard";
import { IncomingRequestList } from "../components/IncomingRequestList";
import { LangToggle } from "../components/LangToggle";
import { useT } from "../i18n";

// v1.0.12: removed DRIVER_DEFAULT (Delhi centroid). When the driver
// goes online without a GPS lock yet, we now send availability without
// lat/lng — the server falls back to the driver's stored location and
// will update on the next location push. No more "you appear in Delhi"
// edge case for first-launch drivers anywhere outside Delhi.
//
// v1.2.0 (CR#1): the per-row distance/ETA chips (and their haversine/eta
// helpers + the inline map) moved out when the closest-first single-card list
// was replaced by the unified SOS-first IncomingRequestList.

type Props = {
  profile: any;
  onLogout: () => void;
  onTrip: (b: Booking) => void;
  onProfile: () => void;
  onEarnings: () => void;
  /** v1.2.4: open the Help & Support (helpdesk ticket) screen. */
  onSupport: () => void;
  /** v1.1.2: refresh /me so admin hospital reassignment reflects near-realtime. */
  onProfileRefresh?: () => void;
};

export function DashboardScreen({ profile, onLogout, onTrip, onProfile, onEarnings, onSupport, onProfileRefresh }: Props) {
  const { t } = useT();
  const [available, setAvailable] = useState(profile?.status !== "OFFLINE");
  // v1.0.15: emit a "I'm online" heartbeat to the SOS cascade engine every
  // 60s while the toggle is on and the app is foregrounded. Pauses
  // automatically when backgrounded.
  useDriverHeartbeat(available);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeTrip, setActiveTrip] = useState<Booking | null>(null);
  const [todayCompleted, setTodayCompleted] = useState(0);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);
  // v1.2.0 (CR#1): unified incoming-request queue, held as a keyed map keyed by
  // booking id. The /driver/incoming poll is the source of truth (reconcile:
  // add/update returned ids, drop ids no longer returned → resolved / expired /
  // reassigned / backend-cancelled). Socket events merge into the SAME map
  // (instant) but never replace it wholesale, so neither SOS nor normal
  // requests can silently overwrite the other.
  const [requests, setRequests] = useState<Record<string, IncomingRequest>>({});
  // Dismiss ≠ reject: the high-priority SOS flash (SosIncomingModal) is a
  // separate surface from this list. Dismissing the flash does NOT call the
  // reject endpoint, so the server row stays REQUESTED and the next
  // /driver/incoming reconcile keeps it in the map — the row persists in the
  // list. Only the per-row Reject button (rejectRequest) actually rejects.
  //
  // v1.2.0 (CR#1): session-local dismiss set for NORMAL broadcast rows. A SOS
  // reject is durable server-side (sos_dispatch_attempts), so a rejected SOS
  // never comes back from /driver/incoming. A NORMAL booking has no per-driver
  // reject row, so /driver/incoming would re-return it every poll — we suppress
  // it client-side for the session (same semantics as the v1.1 "Ignore"). Both
  // the poll reconcile and the socket merge honour this set.
  const dismissed = useRef<Set<string>>(new Set());

  // v1.3.0 (safety): responder-side safety alerts pushed to THIS driver, held
  // as a keyed map keyed by alert id (mirrors the `requests` map pattern). The
  // /driver/safety-active poll is the reconcile source of truth; the
  // `safety:alert` socket event merges into the SAME map (instant) and never
  // replaces it wholesale, so a socket-only and a poll-only alert can coexist.
  // `safetyDismissed` is a session-local set of alert ids the driver dismissed
  // (no ack); honoured by both the poll reconcile and the socket merge so a
  // dismissed alert never re-pops.
  const [safetyAlerts, setSafetyAlerts] = useState<Record<string, SafetyActiveAlert>>({});
  const safetyDismissed = useRef<Set<string>>(new Set());
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

  // v1.1.2: poll /me every 45s so an admin hospital (re)assignment shows up
  // in the driver's app without a relaunch.
  useEffect(() => {
    if (!onProfileRefresh) return;
    const id = setInterval(onProfileRefresh, 45_000);
    return () => clearInterval(id);
  }, [onProfileRefresh]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [incRes, myRes, safetyRes] = await Promise.all([
        incomingApi
          .list()
          .then((r) => ({ ok: true as const, requests: r.requests }))
          .catch(() => ({ ok: false as const, requests: [] as IncomingRequest[] })),
        bookingsApi
          .mine()
          .then((r) => ({ ok: true as const, bookings: r.bookings }))
          .catch(() => ({ ok: false as const, bookings: [] as Booking[] })),
        // v1.3.0 (safety): poll fallback for safety alerts pushed to this
        // driver (the socket can miss, same lesson as sosPending).
        safetyApi
          .active()
          .then((r) => ({ ok: true as const, alerts: r.alerts }))
          .catch(() => ({ ok: false as const, alerts: [] as SafetyActiveAlert[] }))
      ]);
      // Reconcile the keyed map against the authoritative server list — but
      // ONLY on a SUCCESSFUL poll. A transient failure (cold free-tier API,
      // network blip) must NOT wipe the queue: a live SOS stays put through the
      // whole 20s cascade until it's truly resolved (accept / reject / expire /
      // reassign / backend-cancel). Reconciling against an empty error-result
      // was why a still-active SOS vanished after a few seconds.
      if (incRes.ok) {
        const next: Record<string, IncomingRequest> = {};
        for (const r of incRes.requests) {
          if (dismissed.current.has(r.id)) continue; // session-dismissed normal row
          next[r.id] = r;
        }
        setRequests(next);
      }
      // Same keep-last-good discipline for /bookings/mine: only reconcile the
      // active-trip / trips-today cards on a SUCCESSFUL fetch. A transient
      // failure (cold API, blip) used to return {bookings:[]} and clobber a live
      // activeTrip to null mid-ride — skip this tick instead and keep last good.
      if (myRes.ok) {
        const live = myRes.bookings.find((b) =>
          ["ACCEPTED", "ARRIVED", "PICKED_UP"].includes(b.status)
        );
        setActiveTrip(live ?? null);
        setTodayCompleted(myRes.bookings.filter((b) => b.status === "COMPLETED").length);
      }
      // v1.3.0 (safety): reconcile the safetyAlerts map ONLY on a SUCCESSFUL
      // poll — same keep-last-good discipline as the requests map. A transient
      // failure must not wipe a live safety card. Session-dismissed ids are
      // suppressed; the server `acked` flag is preserved so a card the driver
      // already responded to stays in its "Responding" state across polls.
      if (safetyRes.ok) {
        const next: Record<string, SafetyActiveAlert> = {};
        for (const a of safetyRes.alerts) {
          if (safetyDismissed.current.has(a.id)) continue;
          next[a.id] = a;
        }
        setSafetyAlerts(next);
      }
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

  // v1.2.0 (CR#1): subscribe to live offers via socket and MERGE them into the
  // keyed `requests` map (instant surfacing), never replacing the whole map —
  // the /driver/incoming poll remains the reconcile source of truth. We handle
  // both `booking:offered` (normal broadcast) and `sos:incoming` (cascade push)
  // so the unified list reflects either kind the moment it lands. When we have
  // a GPS fix we include it so dispatch's matching sees us in the right place.
  // Listeners are removed on unmount / availability change (audit gate item 4).
  useEffect(() => {
    if (!available) return;
    let cancel = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const sock = await getSocket();
      if (cancel) return;
      const payload: { available: true; lat?: number; lng?: number } = { available: true };
      if (myPos) {
        payload.lat = myPos.lat;
        payload.lng = myPos.lng;
      }
      sock.emit("driver:availability", payload);

      const mergeNormal = (msg: { bookingId?: string }) => {
        if (cancel || !msg?.bookingId) return;
        if (dismissed.current.has(msg.bookingId)) return; // honour session dismiss
        bookingsApi
          .get(msg.bookingId)
          .then((r) => {
            if (cancel) return;
            const b = r.booking;
            setRequests((prev) =>
              prev[b.id]
                ? prev
                : {
                    ...prev,
                    [b.id]: {
                      id: b.id,
                      display_id: b.displayId ?? null,
                      emergency_type: b.emergencyType,
                      pickup_lat: b.pickupLat,
                      pickup_lng: b.pickupLng,
                      pickup_address: b.pickupAddress ?? null,
                      patient_name: b.patientName ?? null,
                      created_at: b.createdAt ?? new Date().toISOString(),
                      is_sos: !!b.isSos
                    }
                  }
            );
          })
          .catch(() => {});
      };

      const mergeSos = (p: any) => {
        if (cancel || !p?.bookingId) return;
        if (dismissed.current.has(p.bookingId)) return; // honour session dismiss
        setRequests((prev) =>
          prev[p.bookingId]
            ? prev
            : {
                ...prev,
                [p.bookingId]: {
                  id: p.bookingId,
                  display_id: p.displayId ?? null,
                  emergency_type: p.emergencyType,
                  pickup_lat: p.pickupLat,
                  pickup_lng: p.pickupLng,
                  pickup_address: p.pickupAddress ?? null,
                  patient_name: p.patientName ?? null,
                  created_at: p.createdAt ?? new Date().toISOString(),
                  is_sos: true
                }
              }
        );
      };

      // v1.3.0 (safety): merge a safety alert pushed to this driver into the
      // keyed safetyAlerts map (instant surfacing), never replacing the whole
      // map — the /driver/safety-active poll stays the reconcile source of
      // truth. Honour the session-dismissed set; preserve an existing acked
      // flag so a "Responding" card isn't reset by a late duplicate push.
      const mergeSafety = (p: any) => {
        if (cancel || !p?.alertId) return;
        if (safetyDismissed.current.has(p.alertId)) return;
        setSafetyAlerts((prev) =>
          prev[p.alertId]
            ? prev
            : {
                ...prev,
                [p.alertId]: {
                  id: p.alertId,
                  bookingId: p.bookingId,
                  displayId: p.displayId ?? null,
                  lat: p.lat,
                  lng: p.lng,
                  createdAt: p.createdAt ?? new Date().toISOString(),
                  acked: false
                }
              }
        );
      };

      // v1.3.0 (safety): the raiser stood down or admin resolved — drop the
      // card by alert id.
      const clearSafety = (p: { alertId?: string }) => {
        if (cancel || !p?.alertId) return;
        setSafetyAlerts((prev) => {
          if (!prev[p.alertId!]) return prev;
          const { [p.alertId!]: _gone, ...rest } = prev;
          return rest;
        });
      };

      sock.on("booking:offered", mergeNormal);
      sock.on("sos:incoming", mergeSos);
      sock.on("safety:alert", mergeSafety);
      sock.on("safety:cleared", clearSafety);
      cleanup = () => {
        sock.off("booking:offered", mergeNormal);
        sock.off("sos:incoming", mergeSos);
        sock.off("safety:alert", mergeSafety);
        sock.off("safety:cleared", clearSafety);
      };
    })();
    return () => {
      cancel = true;
      cleanup?.();
    };
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
      void dialog.alert("Could not update", e?.message ?? "Try again.");
      setAvailable(!next);
    }
  }, [available, myPos]);

  // v1.2.0 (CR#1): accept from the unified list — same atomic accept flow as
  // before; on success route to Trip, on failure drop the (now-taken) row and
  // resync via refresh.
  //
  // v1.3.0 (D2): handle the backend accept-guard (409 driver_on_active_ride)
  // distinctly. If the driver somehow attempts an accept while still on a ride,
  // the booking is NOT taken by anyone — it is just blocked for this driver —
  // so we keep the row in the queue and show a short, plain message instead of
  // the "may have been taken" copy. Any other failure keeps the original
  // behaviour: drop the (now-taken) row and resync via refresh.
  const acceptRequest = async (req: IncomingRequest) => {
    try {
      const r = await bookingsApi.accept(req.id);
      // Set activeTrip optimistically + synchronously so the !activeTrip gate
      // engages this render: it unmounts the SosIncomingModal / safety cards
      // immediately, closing the ~8s window (until the next /bookings/mine
      // poll) in which a queued SOS could otherwise flash over the new trip.
      setActiveTrip(r.booking);
      onTrip(r.booking);
    } catch (e: any) {
      const msg = String(e?.message ?? "").toLowerCase();
      const onActiveRide = e?.status === 409 && msg.includes("driver_on_active_ride");
      if (onActiveRide) {
        void dialog.alert("Still on a ride", "Finish your current ride first.");
        void refresh();
        return;
      }
      void dialog.alert("Could not accept", e?.message ?? "Booking may have been taken.");
      setRequests((prev) => {
        const { [req.id]: _gone, ...rest } = prev;
        return rest;
      });
      void refresh();
    }
  };

  // v1.2.0 (CR#1): reject from the unified list. Remove the row immediately,
  // then make it stick:
  //   • SOS row   → POST /bookings/:id/reject records a sos_dispatch_attempts
  //                 rejection, so the cascade skips this driver and the next
  //                 /driver/incoming no longer returns it (durable).
  //   • NORMAL row → no per-driver reject row exists server-side, so calling
  //                 /reject would 409. Instead suppress it client-side for the
  //                 session (dismissed set, honoured by the poll + socket merge)
  //                 — same behaviour as the v1.1 "Ignore". The booking stays in
  //                 the broadcast pool for other drivers.
  // Distinct from dismissing the SOS flash (which keeps the row in the list).
  const rejectRequest = async (req: IncomingRequest) => {
    dismissed.current.add(req.id);
    setRequests((prev) => {
      const { [req.id]: _gone, ...rest } = prev;
      return rest;
    });
    if (req.is_sos) {
      try {
        await bookingsApi.reject(req.id);
      } catch {
        /* row already gone locally + dismissed; next poll reconciles */
      }
    }
  };

  // v1.3.0 (safety): "I am responding" — record the ack (idempotent server
  // side) with our current GPS if we have it, and flip the card to its calm
  // "Responding" state locally so it doesn't keep prompting. A failed ack
  // leaves the card actionable so the driver can retry.
  const respondSafety = async (alert: SafetyActiveAlert) => {
    try {
      await safetyApi.ack(alert.id, myPos?.lat, myPos?.lng);
      setSafetyAlerts((prev) =>
        prev[alert.id] ? { ...prev, [alert.id]: { ...prev[alert.id], acked: true } } : prev
      );
    } catch (e: any) {
      void dialog.alert("Could not respond", e?.message ?? "Please try again.");
    }
  };

  // v1.3.0 (safety): soft dismiss — remove the card for this session without
  // acking. Suppressed by the dismissed set so neither the poll nor the socket
  // merge re-surfaces it.
  const dismissSafety = (alert: SafetyActiveAlert) => {
    safetyDismissed.current.add(alert.id);
    setSafetyAlerts((prev) => {
      const { [alert.id]: _gone, ...rest } = prev;
      return rest;
    });
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <AppHeader
        title={`Hi${profile?.name ? `, ${String(profile.name).split(" ")[0]}` : ""}`}
        subtitle={[profile?.vehicleNumber, profile?.hospitalName].filter(Boolean).join(" · ") || "Welcome to Jeevan Rakshak"}
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <LangToggle />
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

      {/* v1.3.0 (safety): responder-side safety alert cards. A safety alert is
        * an "all hands near here" event, so it surfaces high on the dashboard
        * (above the active-trip card) styled like an incoming-request row, NOT
        * a full-screen flash. Newest-first. Each wires "I am responding" to the
        * ack and a soft session-local dismiss.
        *
        * FIX D1: do NOT surface responder safety cards while THIS driver is on
        * an active trip. The driver is heads-down on their own emergency ride;
        * an "all hands near here" prompt over an ongoing trip is intrusive and
        * could pull them off-task. The poll keep-last-good still tracks the
        * alerts in state, so the cards reappear automatically the moment the
        * trip clears and the driver is free to respond. Fully working when the
        * driver is NOT on a trip. */}
      {!activeTrip
        ? Object.values(safetyAlerts)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .map((a) => (
              <SafetyAlertCard
                key={a.id}
                alert={a}
                myPos={myPos}
                onRespond={respondSafety}
                onDismiss={dismissSafety}
              />
            ))
        : null}

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
              <Text variant="label" tone="secondary">{t("incoming.title")}</Text>
              {available && (() => {
                const c = Object.keys(requests).length;
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
            // v1.2.0 (CR#1): unified state-backed queue — SOS + normal in one
            // list, sorted SOS-first then newest-first inside IncomingRequestList.
            <IncomingRequestList
              requests={requests}
              myPos={myPos}
              onAccept={acceptRequest}
              onReject={rejectRequest}
            />
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
              <Button label="Trip history" variant="outline" onPress={onEarnings} fullWidth testID="trip-history-cta" />
            </View>
          </View>
          <Button label={t("support.dashboard_cta")} variant="outline" onPress={onSupport} fullWidth testID="support-cta" />
          <Button
            label="Sign out"
            variant="ghost"
            onPress={async () => {
              await clearToken();
              disconnectSocket();
              onLogout();
            }}
          />
          <Button
            label="Delete account"
            variant="ghost"
            onPress={async () => {
              if (
                await dialog.confirm({
                  title: "Delete your driver account?",
                  message:
                    "This will permanently remove your profile and KYC details. Completed trip records are kept for payout reconciliation but cannot be traced back to you. This cannot be undone.",
                  confirmText: "Delete forever",
                  cancelText: "Keep my account",
                  destructive: true
                })
              ) {
                try {
                  await me.delete();
                  await clearToken();
                  disconnectSocket();
                  onLogout();
                } catch (e: any) {
                  const msg = String(e?.message ?? "");
                  if (msg.includes("active_trip_exists")) {
                    void dialog.alert(
                      "Active trip in progress",
                      "Please complete or cancel your current trip before deleting your account."
                    );
                  } else {
                    void dialog.alert("Couldn't delete your account", e?.message ?? "Please try again or contact support.");
                  }
                }
              }
            }}
          />
        </View>
      </Card>
      {/* v1.0.15: SOS cascade modal — fullscreen overlay that pops in when
        * the server pushes an SOS request to this driver. Sits outside the
        * <Screen> scroll so it floats on top regardless of scroll position.
        *
        * FIX D1: never mount the full-screen SOS flash while THIS driver is on
        * an active trip. A big red overlay popping over an ongoing emergency
        * ride is dangerous (it can hide the live trip actions and startle a
        * driver mid-handover). Not rendering the modal also stops its own
        * socket + sos-pending poll from surfacing anything while busy. When the
        * trip clears (back on the dashboard, AVAILABLE again) the modal mounts
        * again and the cascade can flash as normal. Waiting requests stay
        * visible the whole time via the passive peek on TripScreen. */}
      {!activeTrip ? <SosIncomingModal onAccept={(b) => onTrip(b)} /> : null}
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
