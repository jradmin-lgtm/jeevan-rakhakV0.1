import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

type Props = {
  cityName: string;
  subtitle?: string;
};

/**
 * A slim, non-blocking ribbon that sits in the layout flow (not a modal/overlay).
 * Shows a small live dot plus "Live in <cityName>", with an optional muted subline.
 */
function LaunchBannerInner({ cityName, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.dot} />
      <View style={styles.copy}>
        <Text variant="small" weight="bold" tone="primary">
          Live in {cityName}
        </Text>
        {subtitle ? (
          <Text variant="tiny" tone="muted" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.primaryFaint,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success
  },
  copy: {
    flex: 1
  },
  subtitle: {
    marginTop: 2
  }
});

export const LaunchBanner = memo(LaunchBannerInner);
