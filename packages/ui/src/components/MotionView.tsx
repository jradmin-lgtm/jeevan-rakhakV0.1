import React, { useEffect, useRef } from "react";
import { Animated, ViewStyle } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";

type Props = { children: React.ReactNode; changeKey?: string; style?: ViewStyle };

export function MotionView({ children, changeKey, style }: Props) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    progress.stopAnimation();
    if (reduced) { progress.setValue(1); return; }
    progress.setValue(0);
    const transition = Animated.timing(progress, { toValue: 1, duration: 180, useNativeDriver: true });
    transition.start();
    return () => transition.stop();
  }, [changeKey, reduced, progress]);
  return <Animated.View style={[style, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }] }]}>{children}</Animated.View>;
}
