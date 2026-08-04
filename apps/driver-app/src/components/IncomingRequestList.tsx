import React, { useState } from "react";
import { View } from "react-native";
import { Button, Card, EmptyState, Pill, PulseDot, Text, colors, dialog, space } from "@jr/ui";
import { IncomingRequest } from "../api";
import { prettyEmergency } from "../screens/DashboardScreen";
import { useT } from "../i18n";

type LatLng = { lat: number; lng: number };

type Props = {
  requests: Record<string, IncomingRequest>;
  /** Driver's last GPS fix — used to show "X.X km away" per request. */
  myPos: LatLng | null;
  onAccept?: (req: IncomingRequest) => void | Promise<void>;
  onReject?: (req: IncomingRequest) => void | Promise<void>;
  /**
   * v1.3.0 (D2): read-only "deferred" mode for the TripScreen waiting-requests
   * peek. When true, every row reuses the exact same rendering (SOS-first sort,
   * danger border, distance chip, age, badges) but the Accept / Reject controls
   * are replaced by a single disabled, muted label: rides are visible so the
   * driver knows work is queued, but accept is deferred until the current ride
   * completes. onAccept / onReject are not called in this mode. The same rows
   * become actionable again on the dashboard once the trip clears.
   */
  deferred?: boolean;
};

/**
 * v1.2.0 (CR#1) — unified incoming-request list.
 *
 * Renders the keyed map's values sorted SOS-first, then newest-first, so a
 * life-critical SOS always sits above a routine booking and the freshest
 * request leads within each bucket. Each row gets its own Accept / Reject:
 *  - Accept → parent runs the existing accept flow (navigate to Trip).
 *  - Reject → parent calls the existing reject endpoint and removes ONLY that
 *    id from the map (a dismiss of the SOS flash is NOT a reject — see
 *    DashboardScreen's seenIds).
 *
 * This component is pure-presentational: all state (the map, poll reconcile,
 * socket merge) lives in DashboardScreen so nothing here can overwrite the
 * source of truth.
 */
// Request age label — NaN-guarded. A missing/invalid created_at (e.g. a
// socket-merged row before the poll fills it in) must never render "NaNm ago".
function ageLabel(iso: string | null | undefined, t: (k: string) => string): string {
  const ms = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(ms)) return t("incoming.just_now");
  const min = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return min < 1 ? t("incoming.just_now") : t("incoming.request_age_min").replace("{min}", String(min));
}

// Straight-line distance (km) driver → pickup. Re-added in v1.2.5 (was dropped
// when CR#1 replaced the single-card list). Null when we have no GPS fix yet.
function distanceKm(from: LatLng | null, lat: number, lng: number): number | null {
  if (!from) return null;
  const R = 6371;
  const dLat = ((lat - from.lat) * Math.PI) / 180;
  const dLng = ((lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function IncomingRequestList({ requests, myPos, onAccept, onReject, deferred = false }: Props) {
  const { t } = useT();
  const sorted = Object.values(requests).sort(
    (a, b) =>
      Number(b.is_sos) - Number(a.is_sos) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <Card flat>
        <EmptyState title={t("incoming.empty_title")} description={t("incoming.empty_body")} />
      </Card>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      {sorted.map((r) => (
        <IncomingRow key={r.id} req={r} myPos={myPos} onAccept={onAccept} onReject={onReject} deferred={deferred} t={t} />
      ))}
    </View>
  );
}

function IncomingRow({
  req,
  myPos,
  onAccept,
  onReject,
  deferred,
  t
}: {
  req: IncomingRequest;
  myPos: LatLng | null;
  onAccept?: (req: IncomingRequest) => void | Promise<void>;
  onReject?: (req: IncomingRequest) => void | Promise<void>;
  deferred: boolean;
  t: (key: string) => string;
}) {
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  // SOS reject is destructive (the patient is mid-emergency) and the button
  // sits next to Accept — confirm first so a stray tap can't drop a live SOS.
  const doReject = async () => {
    if (!onReject) return;
    if (req.is_sos) {
      if (
        await dialog.confirm({
          title: t("incoming.reject_sos_title"),
          message: t("incoming.reject_sos_body"),
          confirmText: t("incoming.reject_confirm"),
          cancelText: t("incoming.keep"),
          destructive: true
        })
      ) {
        void run(() => onReject(req));
      }
    } else {
      void run(() => onReject(req));
    }
  };

  const dist = distanceKm(myPos, req.pickup_lat, req.pickup_lng);

  return (
    <Card
      padding="md"
      style={req.is_sos ? { borderColor: colors.danger, borderWidth: 1.5 } : undefined}
    >
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {req.is_sos ? <PulseDot size={8} color={colors.danger} rings={1} /> : null}
            <Pill
              label={req.is_sos ? t("incoming.sos_badge") : t("incoming.normal_badge")}
              color={req.is_sos ? colors.danger : colors.primary}
              bg={req.is_sos ? "rgba(239,68,68,0.12)" : colors.primaryFaint}
            />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            {dist != null ? (
              <Text variant="small" weight="semi" style={{ color: req.is_sos ? colors.danger : colors.primary }}>
                {t("incoming.distance_km").replace("{km}", dist.toFixed(1))}
              </Text>
            ) : null}
            <Text variant="tiny" tone="muted">{ageLabel(req.created_at, t)}</Text>
          </View>
        </View>

        <Text variant="body" weight="semi">{prettyEmergency(req.emergency_type, t)}</Text>
        <Text variant="small" tone="secondary">
          {req.pickup_address ?? `${req.pickup_lat.toFixed(4)}, ${req.pickup_lng.toFixed(4)}`}
        </Text>

        {deferred ? (
          // v1.3.0 (D2): read-only deferred mode. The row is non-actionable —
          // no Accept, no Reject — so a driver mid-ride can SEE that work is
          // waiting without being able to take it until the current ride ends.
          // A disabled, muted Button keeps the same footprint as the live
          // action row so the list reads consistently between the peek and the
          // dashboard.
          <View style={{ marginTop: space.xs }}>
            <Button
              label={t("incoming.finish_first")}
              onPress={() => {}}
              variant="outline"
              fullWidth
              disabled
              testID={`incoming-deferred-${req.id}`}
            />
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
            <View style={{ flex: 1 }}>
              <Button
                label={t("incoming.reject")}
                onPress={doReject}
                variant="outline"
                fullWidth
                disabled={busy}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Button
                label={t("incoming.accept")}
                onPress={() => onAccept && run(() => onAccept(req))}
                loading={busy}
                fullWidth
                size="lg"
                testID={`incoming-accept-${req.id}`}
              />
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}
