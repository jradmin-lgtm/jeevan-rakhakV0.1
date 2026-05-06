import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, space } from "../tokens";

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

function AppHeaderInner({ title, subtitle, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: true }}
          style={styles.back}
        >
          <Text variant="heading" weight="bold" style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="heading">{title}</Text>
        {subtitle ? <Text variant="small" tone="secondary">{subtitle}</Text> : null}
      </View>
      {right ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    minHeight: 44
  },
  back: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -space.sm
  }
});

export const AppHeader = memo(AppHeaderInner);
