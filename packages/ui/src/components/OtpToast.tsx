import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, radius, shadow, space } from "../tokens";

type Props = {
  message: string | null;
  onHide?: () => void;
  durationMs?: number;
};

/**
 * Slides down from the top, holds, then slides up — like an SMS auto-fill chip.
 * Used to surface the in-app OTP during the pilot bypass.
 */
function OtpToastInner({ message, onHide, durationMs = 2200 }: Props) {
  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    translateY.setValue(-40);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true })
    ]).start();
    const t = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -40, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
      ]).start(() => onHide?.());
    }, durationMs);
    return () => clearTimeout(t);
  }, [message, durationMs, onHide, opacity, translateY]);

  if (!message) return null;

  return (
    <Animated.View
      style={[styles.wrap, { transform: [{ translateY }], opacity }]}
      pointerEvents="none"
    >
      <View style={styles.chip}>
        <View style={styles.dot} />
        <Text variant="small" tone="inverse" weight="semi">{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.pill,
    ...shadow.pop
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success
  }
});

export const OtpToast = memo(OtpToastInner);
