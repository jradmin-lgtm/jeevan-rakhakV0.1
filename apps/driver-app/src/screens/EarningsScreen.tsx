import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { AppHeader, Card, EmptyState, Pill, Screen, Text, colors, space } from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { prettyEmergency } from "./DashboardScreen";

export function EarningsScreen({ onBack }: { onBack: () => void }) {
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

  const total = items.reduce((acc, b) => acc + (b.fareFinalInr ?? b.fareEstimateInr ?? 0), 0);

  return (
    <Screen scroll={false} padding={0}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
        <AppHeader title="Earnings" onBack={onBack} />
        <Card>
          <View style={{ gap: space.sm }}>
            <Text variant="label" tone="secondary">TOTAL EARNED</Text>
            <Text variant="title" weight="bold" tone="primary">₹{total}</Text>
            <Text variant="small" tone="secondary">{items.length} completed trips</Text>
          </View>
        </Card>
      </View>
      <FlatList
        data={items}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ padding: space.lg, gap: space.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <EmptyState title="No completed trips yet" description="Earnings show up here after each completed booking." />
        }
        renderItem={({ item }) => (
          <Card padding="md">
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Pill label={prettyEmergency(item.emergencyType)} />
                <Text variant="body" weight="semi" tone="primary">₹{item.fareFinalInr ?? item.fareEstimateInr ?? 0}</Text>
              </View>
              <Text variant="small" tone="secondary">{new Date(item.createdAt).toLocaleString()}</Text>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
