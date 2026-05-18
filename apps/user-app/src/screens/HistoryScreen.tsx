import React, { useCallback, useEffect, useState } from "react";
import { Animated, FlatList, RefreshControl, View } from "react-native";
import {
  AppHeader,
  Card,
  EmptyState,
  IconBadge,
  Pill,
  Screen,
  Skeleton,
  StatusBadge,
  Text,
  colors,
  space,
  useFadeIn
} from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { prettyEmergency } from "./HomeScreen";

type Decoration = { glyph: string; tint: string; tintBg: string };

const EMERGENCY_DECOR: Record<string, Decoration> = {
  ACCIDENT_TRAUMA:           { glyph: "✚", tint: "#E5322B", tintBg: "#FCE9E8" },
  CARDIAC:                   { glyph: "♥", tint: "#DC2626", tintBg: "#FEE2E2" },
  BREATHING_DISTRESS:        { glyph: "≈", tint: "#0EA5E9", tintBg: "#E0F2FE" },
  PREGNANCY_NEONATAL:        { glyph: "✿", tint: "#DB2777", tintBg: "#FCE7F3" },
  GENERAL_CRITICAL_TRANSFER: { glyph: "→", tint: "#7C3AED", tintBg: "#EDE9FE" }
};

export function HistoryScreen({ onBack, onOpen }: { onBack: () => void; onOpen: (b: Booking) => void }) {
  const [items, setItems] = useState<Booking[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await bookingsApi.mine();
      setItems(r.bookings);
    } finally {
      setRefreshing(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <Screen scroll={false} padding={0}>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm }}>
        <AppHeader title="Trip history" subtitle={items.length ? `${items.length} trips so far` : undefined} onBack={onBack} />
      </View>

      {!loaded ? (
        <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
          {[0, 1, 2].map((i) => (
            <Card key={i} padding="md">
              <View style={{ gap: space.sm }}>
                <Skeleton width={140} height={10} />
                <Skeleton width="100%" height={20} />
                <Skeleton width="50%" height={14} />
              </View>
            </Card>
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={
            <EmptyState
              title="No bookings yet"
              description="Your trips will appear here. Pull down to refresh."
            />
          }
          renderItem={({ item, index }) => <HistoryRow item={item} index={index} onOpen={onOpen} />}
        />
      )}
    </Screen>
  );
}

function HistoryRow({ item, index, onOpen }: { item: Booking; index: number; onOpen: (b: Booking) => void }) {
  const fade = useFadeIn(Math.min(index * 60, 240));
  const decor = EMERGENCY_DECOR[item.emergencyType] ?? { glyph: "•", tint: colors.primary, tintBg: colors.primaryFaint };
  // v1.0.15: ride history shows what the patient actually PAID (₹0 in pilot
  // via PILOT100), not the gross fare. `paidInr` is set on /complete (normal
  // flow) or /mark-paid (SOS post-completion). Only completed rides show the
  // chip — in-flight rows leave the slot empty.
  const paidLabel =
    item.status === "COMPLETED" && item.paidInr != null
      ? item.paidInr === 0
        ? "Paid: ₹0"
        : `Paid: ₹${item.paidInr}`
      : null;
  return (
    <Animated.View style={fade}>
      <Card onPress={() => onOpen(item)} padding="md">
        <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
          <IconBadge glyph={decor.glyph} bg={decor.tintBg} color={decor.tint} size={42} />
          <View style={{ flex: 1, gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Pill label={prettyEmergency(item.emergencyType)} color={decor.tint} bg={decor.tintBg} />
              <StatusBadge status={item.status} />
            </View>
            <Text variant="body" weight="semi">{item.pickupAddress ?? "Pickup location"}</Text>
            {item.dropAddress ? (
              <Text variant="small" tone="secondary">→ {item.dropAddress}</Text>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="small" tone="muted">{new Date(item.createdAt).toLocaleString()}</Text>
              {paidLabel ? (
                <Text variant="body" weight="bold" tone={item.paidInr === 0 ? "success" : "primary"}>
                  {paidLabel}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}
