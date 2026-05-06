import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";
import { colors, radius } from "../tokens";

type Props = {
  width?: number | `${number}%` | "100%";
  height?: number;
  style?: ViewStyle;
  rounded?: boolean;
};

/**
 * Shimmer placeholder. One opacity loop using the native driver — costs almost
 * nothing even on entry-level Android.
 */
function SkeletonInner({ width = "100%", height = 12, style, rounded }: Props) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, opacity, borderRadius: rounded ? height / 2 : radius.sm },
        style
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.border }
});

export const Skeleton = memo(SkeletonInner);
