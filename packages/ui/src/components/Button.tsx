import React, { memo, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  ViewStyle
} from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { Text } from "./Text";
import { colors, radius, space, animation } from "../tokens";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline" | "neutral";
type Size = "sm" | "md" | "lg";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
};

const bg: Record<Variant, string> = {
  primary: colors.primary,
  secondary: colors.accent,
  danger: colors.danger,
  ghost: "transparent",
  outline: "transparent",
  neutral: colors.bg
};
const fg: Record<Variant, string> = {
  primary: colors.textInverse,
  secondary: colors.textInverse,
  danger: colors.textInverse,
  ghost: colors.primary,
  outline: colors.primary,
  neutral: colors.textPrimary
};
const border: Record<Variant, string> = {
  primary: colors.primary,
  secondary: colors.accent,
  danger: colors.danger,
  ghost: "transparent",
  outline: colors.primary,
  neutral: "transparent"
};
const padY: Record<Size, number> = { sm: 8, md: 12, lg: 16 };
const padX: Record<Size, number> = { sm: 12, md: 16, lg: 20 };

function ButtonInner({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  fullWidth,
  style,
  testID
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  useEffect(() => () => scale.stopAnimation(), [scale]);

  const onPressIn = useCallback(() => {
    if (reduced) return;
    Animated.timing(scale, {
      toValue: 0.97,
      duration: animation.fast,
      useNativeDriver: true
    }).start();
  }, [scale, reduced]);

  const onPressOut = useCallback(() => {
    Animated.timing(scale, {
      toValue: 1,
      duration: animation.fast,
      useNativeDriver: true
    }).start();
  }, [scale, reduced]);

  const isDisabled = disabled || loading;

  return (
    <Animated.View style={{ transform: [{ scale }], width: fullWidth ? "100%" : undefined }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
        testID={testID}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: false }}
        style={[
          styles.base,
          {
            backgroundColor: bg[variant],
            borderColor: border[variant],
            borderWidth: variant === "outline" ? 1.5 : 0,
            paddingVertical: padY[size],
            paddingHorizontal: padX[size]
          },
          isDisabled ? styles.disabled : null,
          style
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={fg[variant]} />
        ) : (
          <Text variant="body" weight="semi" align="center" style={{ color: fg[variant] }}>
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44 // accessible tap target
  },
  disabled: { opacity: 0.5 }
});

export const Button = memo(ButtonInner);
