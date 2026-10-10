import React, { memo } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "./Text";
import { colors, space } from "../tokens";

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
};

function AppHeaderInner({ title, subtitle, onBack, right }: Props) {
  const { width, fontScale } = useWindowDimensions();
  const stackActions = !!right && (width < 360 || fontScale > 1.2);
  return (
    <View style={{ gap: space.xs }}>
    <View style={styles.row}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={4}
          android_ripple={{ color: "rgba(0,0,0,0.06)", borderless: true }}
          style={styles.back}
        >
          <Text variant="heading" weight="bold" style={{ fontSize: 24 }}>‹</Text>
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="heading">{title}</Text>
        {subtitle ? <Text variant="small" tone="secondary">{subtitle}</Text> : null}
      </View>
      {!stackActions ? right : null}
    </View>
    {stackActions ? <View style={{ alignSelf: "flex-end", maxWidth: "100%" }}>{right}</View> : null}
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
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -space.sm
  }
});

export const AppHeader = memo(AppHeaderInner);
