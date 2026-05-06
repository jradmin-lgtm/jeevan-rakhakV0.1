import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors } from "../tokens";

type Props = {
  size?: number;
  color?: string;
  /** number of expanding rings, default 2 */
  rings?: number;
};

/**
 * Breathing dot with expanding rings — used to convey "live", "tracking",
 * "searching" states. Pure native-driver Animated so it costs ~nothing on
 * low-RAM devices.
 */
function PulseDotInner({ size = 12, color = colors.primary, rings = 2 }: Props) {
  const ringValues = useRef(
    Array.from({ length: rings }, () => ({
      scale: new Animated.Value(1),
      opacity: new Animated.Value(0.45)
    }))
  ).current;

  useEffect(() => {
    const loops = ringValues.map((v, i) => {
      const reset = () => {
        v.scale.setValue(1);
        v.opacity.setValue(0.45);
      };
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(i * 700),
          Animated.parallel([
            Animated.timing(v.scale, { toValue: 2.6, duration: 1400, useNativeDriver: true }),
            Animated.timing(v.opacity, { toValue: 0, duration: 1400, useNativeDriver: true })
          ])
        ])
      );
      reset();
      loop.start();
      return loop;
    });
    return () => loops.forEach((l) => l.stop());
  }, [ringValues]);

  return (
    <View style={[styles.wrap, { width: size * 3, height: size * 3 }]}>
      {ringValues.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: color,
              opacity: v.opacity,
              transform: [{ scale: v.scale }]
            }
          ]}
        />
      ))}
      <View style={[styles.core, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute" },
  core: { position: "absolute" }
});

export const PulseDot = memo(PulseDotInner);
