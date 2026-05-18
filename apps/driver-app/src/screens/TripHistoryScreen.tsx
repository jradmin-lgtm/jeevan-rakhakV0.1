import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { AppHeader, Card, EmptyState, Pill, Screen, Text, colors, space } from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { prettyEmergency } from "./DashboardScreen";
import { useT } from "../i18n";

/**
 * v1.0.15 — replaces EarningsScreen. The pilot doesn't pay drivers through
 * the app yet (real payout is being designed by ops), so showing a fare-sum
 * is misleading. Trip History focuses on what's verifiable:
 *   - When the trip happened (date)
 *   - Where it ran (pickup → drop)
 *   - How far (Haversine km between pickup and drop coords)
 *   - How long (completedAt − acceptedAt, or createdAt as fallback)
 *
 * No money is rendered anywhere in this screen.
 */
export function TripHistoryScreen({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const [items, setItems] = useState<Booking[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await bookingsApi.mine();
      setItems(r.bookings.filter((b) => b.status === "COMPLETED"));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Screen scroll={false} padding={0}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
        <AppHeader title={t("trip_history.title")} onBack={onBack} />
        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="secondary">{t("trip_history.subtitle").toUpperCase()}</Text>
            <Text variant="title" weight="bold" tone="primary">{items.length}</Text>
            <Text variant="small" tone="secondary">{t("trip_history.title")}</Text>
          </View>
        </Card>
      </View>
      <FlatList
        data={items}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <EmptyState title={t("trip_history.empty")} description={t("trip_history.subtitle")} />
        }
        renderItem={({ item }) => <TripHistoryRow item={item} t={t} />}
      />
    </Screen>
  );
}

function TripHistoryRow({ item, t }: { item: Booking; t: (k: string) => string }) {
  const km = (item.dropLat != null && item.dropLng != null)
    ? haversineKm(item.pickupLat, item.pickupLng, item.dropLat, item.dropLng)
    : null;
  const startMs = item.acceptedAt ? new Date(item.acceptedAt).getTime()
    : item.createdAt ? new Date(item.createdAt).getTime()
    : null;
  const endMs = item.completedAt ? new Date(item.completedAt).getTime() : null;
  const durationMin = (startMs != null && endMs != null && endMs > startMs)
    ? Math.max(1, Math.round((endMs - startMs) / 60_000))
    : null;
  const durationLabel = durationMin == null
    ? "—"
    : durationMin >= 60
      ? t("trip_history.duration_long")
          .replace("{hours}", String(Math.floor(durationMin / 60)))
          .replace("{minutes}", String(durationMin % 60))
      : t("trip_history.duration").replace("{minutes}", String(durationMin));
  const kmLabel = km == null ? "—" : t("trip_history.km").replace("{km}", km.toFixed(1));
  const dateLabel = item.completedAt
    ? new Date(item.completedAt).toLocaleString()
    : new Date(item.createdAt).toLocaleString();

  return (
    <Card padding="md">
      <View style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Pill label={prettyEmergency(item.emergencyType)} />
          <Text variant="small" tone="muted">{dateLabel}</Text>
        </View>
        <View style={{ gap: 2 }}>
          <Text variant="small" tone="secondary" numberOfLines={1}>
            {truncate(item.pickupAddress ?? `${item.pickupLat.toFixed(3)}, ${item.pickupLng.toFixed(3)}`, 36)}
          </Text>
          <Text variant="small" tone="secondary" numberOfLines={1}>
            → {truncate(item.dropAddress ?? "—", 36)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: space.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View>
            <Text variant="tiny" tone="muted">DISTANCE</Text>
            <Text variant="body" weight="semi">{kmLabel}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text variant="tiny" tone="muted">TIME TAKEN</Text>
            <Text variant="body" weight="semi">{durationLabel}</Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
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
