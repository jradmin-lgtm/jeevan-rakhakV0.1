import React, { useState } from "react";
import { View } from "react-native";
import { Button, Card, EmptyState, Pill, PulseDot, Text, colors, space } from "@jr/ui";
import { IncomingRequest } from "../api";
import { prettyEmergency } from "../screens/DashboardScreen";
import { useT } from "../i18n";

type Props = {
  requests: Record<string, IncomingRequest>;
  onAccept: (req: IncomingRequest) => void | Promise<void>;
  onReject: (req: IncomingRequest) => void | Promise<void>;
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
function ageMinutes(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function IncomingRequestList({ requests, onAccept, onReject }: Props) {
  const { t } = useT();
  const sorted = Object.values(requests).sort(
    (a, b) =>
      Number(b.is_sos) - Number(a.is_sos) ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <Card flat>
        <EmptyState title="No active requests" description="New SOS and booking requests will appear here instantly." />
      </Card>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      {sorted.map((r) => (
        <IncomingRow key={r.id} req={r} onAccept={onAccept} onReject={onReject} t={t} />
      ))}
    </View>
  );
}

function IncomingRow({
  req,
  onAccept,
  onReject,
  t
}: {
  req: IncomingRequest;
  onAccept: (req: IncomingRequest) => void | Promise<void>;
  onReject: (req: IncomingRequest) => void | Promise<void>;
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
          <Text variant="tiny" tone="muted">
            {t("incoming.request_age_min").replace("{min}", String(ageMinutes(req.created_at)))}
          </Text>
        </View>

        <Text variant="body" weight="semi">{prettyEmergency(req.emergency_type)}</Text>
        <Text variant="small" tone="secondary">
          {req.pickup_address ?? `${req.pickup_lat.toFixed(4)}, ${req.pickup_lng.toFixed(4)}`}
        </Text>

        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xs }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t("incoming.reject")}
              onPress={() => run(() => onReject(req))}
              variant="outline"
              fullWidth
              disabled={busy}
            />
          </View>
          <View style={{ flex: 2 }}>
            <Button
              label={t("incoming.accept")}
              onPress={() => run(() => onAccept(req))}
              loading={busy}
              fullWidth
              size="lg"
              testID={`incoming-accept-${req.id}`}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}
