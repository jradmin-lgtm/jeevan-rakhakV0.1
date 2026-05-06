import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { PulseDot } from "./PulseDot";
import { colors, radius, space } from "../tokens";

type Props = {
  driverActive?: boolean;
  pickupLabel?: string;
  driverLabel?: string;
  height?: number;
};

/**
 * Mock map view — diagonal route from pickup pin → animated driver dot.
 * Provides the "we have a map" affordance without pulling in a maps SDK.
 *
 * Replace with `<MapView />` from `react-native-maps` once the team plugs in
 * GOOGLE_MAPS_API_KEY (the structure here matches MapView's typical use).
 */
function MapPlaceholderInner({ driverActive, pickupLabel = "Pickup", driverLabel = "Driver", height = 200 }: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!driverActive) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: 6000, useNativeDriver: false }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: false })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [driverActive, progress]);

  const driverLeft = progress.interpolate({ inputRange: [0, 1], outputRange: ["10%", "78%"] });
  const driverTop = progress.interpolate({ inputRange: [0, 1], outputRange: ["72%", "16%"] });

  return (
    <View style={[styles.frame, { height }]}>
      {/* Grid lines for "map" feel */}
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={`h${i}`} style={[styles.gridH, { top: `${(i + 1) * 16}%` }]} />
      ))}
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={`v${i}`} style={[styles.gridV, { left: `${(i + 1) * 16}%` }]} />
      ))}

      {/* Diagonal route line */}
      <View style={styles.route} />

      {/* Pickup pin */}
      <View style={[styles.pin, { left: "8%", top: "70%" }]}>
        <View style={[styles.pinDot, { backgroundColor: colors.accent }]} />
        <View style={styles.pinLabel}>
          <Text variant="tiny" weight="semi" style={{ color: colors.accent }}>{pickupLabel}</Text>
        </View>
      </View>

      {/* Driver pin (animated when driverActive) */}
      <Animated.View style={[styles.pin, { left: driverLeft, top: driverTop }]}>
        {driverActive ? <PulseDot size={10} color={colors.primary} /> : <View style={[styles.pinDot, { backgroundColor: colors.primary }]} />}
        <View style={[styles.pinLabel, { backgroundColor: colors.primaryFaint }]}>
          <Text variant="tiny" weight="semi" style={{ color: colors.primary }}>{driverLabel}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    backgroundColor: "#EEF2F7",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    position: "relative"
  },
  gridH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(15,23,42,0.05)" },
  gridV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(15,23,42,0.05)" },
  route: {
    position: "absolute",
    left: "10%",
    top: "20%",
    width: "75%",
    height: 0,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
    borderStyle: "dashed",
    transform: [{ rotate: "32deg" }, { translateY: 60 }]
  },
  pin: { position: "absolute", alignItems: "center", gap: 4 },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: "#fff" },
  pinLabel: {
    backgroundColor: "rgba(30,94,255,0.10)",
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm
  }
});

export const MapPlaceholder = memo(MapPlaceholderInner);
