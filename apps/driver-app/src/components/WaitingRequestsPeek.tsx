import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Card, Pill, PulseDot, Text, colors, space } from "@jr/ui";
import {
  bookings as bookingsApi,
  incoming as incomingApi,
  IncomingRequest,
  SosPending
} from "../api";
import { IncomingRequestList } from "./IncomingRequestList";
import { useT } from "../i18n";

type LatLng = { lat: number; lng: number };

type Props = {
  /** Driver's last GPS fix, passed through for the per-row "X.X km away" chip. */
  myPos: LatLng | null;
};

// v1.3.0 (D2): map a /driver/sos-pending row (camelCase, like the socket push)
// into the snake_case IncomingRequest shape the unified list renders. Mirrors
// the mergeSos shape DashboardScreen builds from the socket event so both
// sources reconcile into one keyed map. distanceKm / waveNumber are not part of
// the row card, so they are dropped here. is_sos is always true for this feed.
function fromSosPending(s: SosPending): IncomingRequest {
  return {
    id: s.bookingId,
    display_id: null,
    emergency_type: s.emergencyType,
    pickup_lat: s.pickupLat,
    pickup_lng: s.pickupLng,
    pickup_address: s.pickupAddress ?? null,
    patient_name: null,
    created_at: new Date().toISOString(),
    is_sos: true
  };
}

/**
 * v1.3.0 (D2): passive "waiting requests" peek for TripScreen.
 *
 * While the driver is on an active ride they should STILL SEE that rides are
 * queued (Ola / Uber style) without being able to accept until the current ride
 * completes. This is a compact, visually subordinate section, NOT a full-screen
 * flash: it reuses the exact IncomingRequestList row rendering in its read-only
 * `deferred` mode (Accept replaced by a disabled "Finish your current ride to
 * accept" label, rows non-actionable).
 *
 * Polling discipline mirrors the dashboard:
 *  Light 8s interval against the same two endpoints the dashboard uses
 *    (/driver/incoming plus /driver/sos-pending), merged into one keyed map.
 *  Keep-last-good: a transient poll failure does NOT wipe the list, so a
 *    waiting request does not flicker out on a cold free-tier API blip.
 *  On a SUCCESSFUL poll we reconcile to the authoritative set, so a request
 *    another driver has already taken naturally drops off the next tick.
 *  Cleanup on unmount (clears the interval plus cancels in-flight setState).
 *
 * Acceptance is intentionally NOT wired here. The moment the ride completes the
 * driver returns to the dashboard (AVAILABLE again) where the normal incoming
 * list re-enables Accept for whatever is still open.
 */
export function WaitingRequestsPeek({ myPos }: Props) {
  const { t } = useT();
  // Keyed by booking id, the same source-of-truth pattern as the dashboard's
  // `requests` map so the two reconcile identically.
  const [requests, setRequests] = useState<Record<string, IncomingRequest>>({});

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      // Pull both feeds the dashboard uses. Each is independently guarded so a
      // failure in one does not discard a good result from the other.
      const [incRes, sosRes] = await Promise.all([
        incomingApi
          .list()
          .then((r) => ({ ok: true as const, requests: r.requests }))
          .catch(() => ({ ok: false as const, requests: [] as IncomingRequest[] })),
        bookingsApi
          .sosPending()
          .then((r) => ({ ok: true as const, sos: r.sos }))
          .catch(() => ({ ok: false as const, sos: [] as SosPending[] }))
      ]);

      if (!mounted) return;

      // Keep-last-good: if BOTH feeds failed this tick, leave the current list
      // untouched rather than wiping it on a transient error.
      if (!incRes.ok && !sosRes.ok) return;

      // Reconcile to the authoritative union of whatever succeeded. A request
      // another driver has taken stops being returned and therefore drops off
      // here automatically. The incoming list is the primary source; any
      // sos-pending row not already present is merged in (SOS that the socket /
      // incoming poll has not surfaced yet still shows as waiting).
      const next: Record<string, IncomingRequest> = {};
      if (incRes.ok) {
        for (const r of incRes.requests) next[r.id] = r;
      }
      if (sosRes.ok) {
        for (const s of sosRes.sos) {
          if (!next[s.bookingId]) next[s.bookingId] = fromSosPending(s);
        }
      }
      setRequests(next);
    };
    void poll();
    const id = setInterval(poll, 8000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const count = Object.keys(requests).length;
  if (count === 0) return null;

  return (
    <Card flat>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <PulseDot size={6} color={colors.primary} rings={1} />
            <Text variant="label" tone="secondary">{t("waiting_peek.title")}</Text>
            <Pill label={`${count}`} color={colors.primary} bg={colors.primaryFaint} />
          </View>
        </View>
        <Text variant="tiny" tone="muted">
          {t("waiting_peek.body")}
        </Text>
        <IncomingRequestList requests={requests} myPos={myPos} deferred />
      </View>
    </Card>
  );
}
