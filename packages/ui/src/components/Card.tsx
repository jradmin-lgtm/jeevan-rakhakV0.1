import React, { memo } from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { colors, radius, shadow, space } from "../tokens";

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  padding?: keyof typeof space;
  flat?: boolean;
};

function CardInner({ children, onPress, style, padding = "lg", flat }: Props) {
  const inner = (
    <View
      style={[
        styles.card,
        { padding: space[padding] },
        flat ? null : shadow.card,
        style
      ]}
    >
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: "rgba(0,0,0,0.04)" }}
        style={({ pressed }) => (pressed ? { opacity: 0.92 } : null)}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  }
});

export const Card = memo(CardInner);
