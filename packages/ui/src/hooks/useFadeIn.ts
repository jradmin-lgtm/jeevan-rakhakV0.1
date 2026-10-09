import { useReducedMotion } from "./useReducedMotion";
import { useEffect, useRef } from "react";
import { Animated } from "react-native";
import { animation } from "../tokens";

/**
 * Tiny entrance animation — opacity + translateY 8→0.
 * Cheap on low-RAM Android (single Animated.Value, native driver).
 */
export function useFadeIn(delay = 0) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  const translate = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) { opacity.setValue(1); translate.setValue(0); return; }
    opacity.setValue(0.7); translate.setValue(4);
    const entrance = Animated.parallel([
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
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [opacity, translate, delay, reducedMotion]);
  return {
    opacity,
    transform: [{ translateY: translate }]
  };
}
