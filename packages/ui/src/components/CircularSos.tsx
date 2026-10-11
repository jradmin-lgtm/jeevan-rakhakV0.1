import React, { useEffect, useRef } from "react";
import { Animated, Pressable, View, useWindowDimensions } from "react-native";
import { Text } from "./Text";
import { colors } from "../tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";

export function CircularSos({ label, hint, accessibilityLabel, onPress, disabled = false, inverse = false, testID }: {
  label: string; hint: string; accessibilityLabel: string; onPress: () => void;
  disabled?: boolean; inverse?: boolean; testID: string;
}) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const { width, fontScale } = useWindowDimensions();
  const size = Math.min(width - 72, Math.max(184, 176 * Math.min(fontScale, 1.4)));
  useEffect(() => {
    pulse.setValue(0);
    if (reduced || disabled) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1400, useNativeDriver: true })
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced, disabled]);
  return <View style={{ alignItems: "center", paddingVertical: 22 }}>
    <View style={{ width: size + 28, height: size + 28, alignItems: "center", justifyContent: "center" }}>
      <Animated.View pointerEvents="none" style={{ position: "absolute", width: size + 28, height: size + 28, borderRadius: (size + 28) / 2,
        backgroundColor: inverse ? "rgba(255,255,255,0.22)" : colors.primaryFaint,
        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }} />
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled, busy: disabled }} disabled={disabled} onPress={onPress}
        style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: inverse ? "#A91F24" : colors.primary,
          borderWidth: inverse ? 2 : 0, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center", padding: 18, gap: 6, opacity: disabled || pressed ? 0.75 : 1 })}>
        <Text tone="inverse" weight="bold" align="center" style={{ fontSize: 38, lineHeight: 46 }}>{label}</Text>
        <Text tone="inverse" weight="semi" align="center">{hint}</Text>
      </Pressable>
    </View>
  </View>;
}
