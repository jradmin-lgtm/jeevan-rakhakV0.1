import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { animation } from "../tokens";

/**
 * Tiny entrance animation — opacity + translateY 8→0.
 * Cheap on low-RAM Android (single Animated.Value, native driver).
 */
export function useFadeIn(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: animation.normal,
        delay,
        useNativeDriver: true
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: animation.normal,
        delay,
        useNativeDriver: true
      })
    ]).start();
  }, [opacity, translate, delay]);
  return {
    opacity,
    transform: [{ translateY: translate }]
  };
}
