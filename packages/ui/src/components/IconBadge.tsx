import React, { memo } from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { Text } from "./Text";
import { colors, radius } from "../tokens";

type Props = {
  glyph: string;
  bg?: string;
  color?: string;
  size?: number;
  style?: ViewStyle;
};

/**
 * Square colored badge with a centered unicode glyph. We avoid SVG/Lottie to
 * keep the APK small. Glyphs render natively through the platform font.
 */
function IconBadgeInner({ glyph, bg = colors.primaryFaint, color = colors.primary, size = 40, style }: Props) {
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          backgroundColor: bg
        },
        style
      ]}
    >
      <Text variant="heading" style={{ color, fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.6) }}>
        {glyph}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" }
});

export const IconBadge = memo(IconBadgeInner);
