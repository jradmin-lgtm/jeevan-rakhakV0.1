import React, { useState } from "react";
import { Linking, View } from "react-native";
import { Button, Card, Pill, PulseDot, Text, colors, space } from "@jr/ui";
import { SafetyActiveAlert } from "../api";
import { useT } from "../i18n";

type LatLng = { lat: number; lng: number };

type Props = {
  alert: SafetyActiveAlert;
  /** Responder's last GPS fix, used to show "X.X km away". Null until located. */
  myPos: LatLng | null;
  /** Calls safety.ack(alertId) on the parent; flips the row into "Responding". */
  onRespond: (alert: SafetyActiveAlert) => void | Promise<void>;
  /** Session-local dismiss; removes the card without acking. */
  onDismiss: (alert: SafetyActiveAlert) => void;
};

/**
 * v1.3.0 (safety) — responder-side card for a safety alert raised nearby.
 *
 * A banner-style card (NOT a full-screen flash like SosIncomingModal): a safety
 * alert is "help is wanted near here", not a dispatch hand-off, so it sits in
 * the dashboard flow styled like an IncomingRequestList row with a danger
 * border. Buttons: Open in Maps (Google Maps query of the raiser's lat/lng),
 * I am responding (acks), and a soft Dismiss (session-local). Once acked the
 * card shows a calm "Responding" state instead of the action buttons.
 */
function openInMaps(lat: number, lng: number) {
  // Universal Google Maps search URL — no Maps API key / quota. Opens the
  // native app when installed, else the browser with the same query.
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  Linking.openURL(url).catch(() => {
    /* Maps app not installed — the same URL opens in the browser */
  });
}

// Straight-line distance (km) responder → raiser. Null when no GPS fix yet.
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

// Alert age label — NaN-guarded, mirrors IncomingRequestList's ageLabel.
function ageLabel(iso: string | null | undefined, t: (key: string) => string): string {
  const ms = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(ms)) return t("incoming.just_now");
  const min = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  return min < 1 ? t("incoming.just_now") : t("incoming.request_age_min").replace("{min}", String(min));
}

export function SafetyAlertCard({ alert, myPos, onRespond, onDismiss }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  const respond = async () => {
    setBusy(true);
    try {
      await onRespond(alert);
    } finally {
      setBusy(false);
    }
  };

  const dist = distanceKm(myPos, alert.lat, alert.lng);
  const rideLabel = alert.displayId ? `${t("safety.ride_prefix")}${alert.displayId}` : t("safety.nearby_ride");
  const distAge = [
    dist != null ? t("incoming.distance_km").replace("{km}", dist.toFixed(1)) : null,
    ageLabel(alert.createdAt, t)
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card padding="md" style={{ borderColor: colors.danger, borderWidth: 1.5 }}>
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <PulseDot size={8} color={colors.danger} rings={1} />
            <Pill label={t("safety.label")} color={colors.danger} bg="rgba(239,68,68,0.12)" />
          </View>
          <Text variant="tiny" tone="muted">{distAge}</Text>
        </View>

        <Text variant="body" weight="semi">{t("safety.alert_title")}</Text>
        <Text variant="small" tone="secondary">{t("safety.alert_body").replace("{rideLabel}", rideLabel)}</Text>

        {alert.acked ? (
          // Acked: calm "Responding" state. Keep Open in Maps so the responder
          // can still navigate; drop the respond/dismiss actions.
          <View style={{ gap: space.sm, marginTop: space.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <PulseDot size={8} color={colors.success} rings={1} />
              <Text variant="small" weight="bold" tone="success">{t("safety.responding")}</Text>
            </View>
            <Button
              label={t("trip.open_maps")}
              onPress={() => openInMaps(alert.lat, alert.lng)}
              variant="outline"
              fullWidth
            />
          </View>
        ) : (
          <View style={{ gap: space.sm, marginTop: space.xs }}>
            <Button
              label={t("trip.open_maps")}
              onPress={() => openInMaps(alert.lat, alert.lng)}
              variant="outline"
              fullWidth
            />
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("safety.dismiss")}
                  onPress={() => onDismiss(alert)}
                  variant="ghost"
                  fullWidth
                  disabled={busy}
                />
              </View>
              <View style={{ flex: 2 }}>
                <Button
                  label={t("safety.i_am_responding")}
                  onPress={respond}
                  variant="danger"
                  loading={busy}
                  fullWidth
                  size="lg"
                  testID={`safety-respond-${alert.id}`}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    </Card>
  );
}
