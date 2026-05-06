import React, { memo } from "react";
import { Text as RNText, StyleSheet, TextStyle } from "react-native";
import { colors, font } from "../tokens";

type Variant = "title" | "heading" | "body" | "small" | "tiny" | "label";
type Tone = "primary" | "secondary" | "muted" | "inverse" | "danger" | "success";

type Props = React.ComponentProps<typeof RNText> & {
  variant?: Variant;
  tone?: Tone;
  weight?: "regular" | "medium" | "semi" | "bold";
  align?: "left" | "center" | "right";
};

const variantStyle: Record<Variant, TextStyle> = {
  title:   { fontSize: font.sizeXxl, fontWeight: font.weightBold,    lineHeight: 34 },
  heading: { fontSize: font.sizeLg,  fontWeight: font.weightSemi,    lineHeight: 24 },
  body:    { fontSize: font.sizeMd,  fontWeight: font.weightRegular, lineHeight: 22 },
  small:   { fontSize: font.sizeSm,  fontWeight: font.weightRegular, lineHeight: 18 },
  tiny:    { fontSize: font.sizeXs,  fontWeight: font.weightRegular, lineHeight: 14 },
  label:   { fontSize: font.sizeSm,  fontWeight: font.weightSemi,    lineHeight: 18, letterSpacing: 0.4 }
};

const toneColor: Record<Tone, string> = {
  primary:   colors.textPrimary,
  secondary: colors.textSecondary,
  muted:     colors.textMuted,
  inverse:   colors.textInverse,
  danger:    colors.danger,
  success:   colors.success
};

const weightMap = {
  regular: font.weightRegular,
  medium: font.weightMedium,
  semi: font.weightSemi,
  bold: font.weightBold
};

function TextInner({ variant = "body", tone = "primary", weight, align, style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      style={[
        variantStyle[variant],
        { color: toneColor[tone] },
        weight ? { fontWeight: weightMap[weight] } : null,
        align ? { textAlign: align } : null,
        style
      ]}
    />
  );
}

export const Text = memo(TextInner);
