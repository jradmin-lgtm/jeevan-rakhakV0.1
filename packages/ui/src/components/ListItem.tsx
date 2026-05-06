import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

type Props = {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
};

function ListItemInner({ title, subtitle, trailing, onPress, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      android_ripple={{ color: "rgba(0,0,0,0.04)" }}
      style={({ pressed }) => [styles.row, pressed ? { opacity: 0.92 } : null]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="semi">{title}</Text>
        {subtitle ? <Text variant="small" tone="secondary">{subtitle}</Text> : null}
      </View>
      {trailing ?? null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border
  }
});

export const ListItem = memo(ListItemInner);
