import React, { memo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

type Props = {
  label: string;
  color?: string;
  bg?: string;
  style?: ViewStyle;
};

function PillInner({ label, color, bg, style }: Props) {
  return (
    <View style={[styles.pill, { backgroundColor: bg ?? colors.primaryFaint }, style]}>
      <Text variant="tiny" weight="semi" style={{ color: color ?? colors.primary, letterSpacing: 0.4 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill
  }
});

export const Pill = memo(PillInner);
