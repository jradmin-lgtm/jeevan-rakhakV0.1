import React, { memo } from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { Text } from "./Text";
import { colors, font, radius, space } from "../tokens";

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

function InputInner({ label, error, style, ...rest }: Props) {
  return (
    <View style={{ gap: 4 }}>
      {label ? (
        <Text variant="label" tone="secondary">{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        {...rest}
        style={[styles.input, error ? styles.inputError : null, style]}
      />
      {error ? (
        <Text variant="tiny" tone="danger">{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    fontSize: font.sizeMd,
    color: colors.textPrimary,
    minHeight: 44
  },
  inputError: { borderColor: colors.danger }
});

export const Input = memo(InputInner);
