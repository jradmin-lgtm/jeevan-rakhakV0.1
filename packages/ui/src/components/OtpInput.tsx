import React, { memo, useRef } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
  error?: string;
};

function OtpInputInner({ value, onChangeText, length = 4, autoFocus, error }: Props) {
  const inputRef = useRef<TextInput>(null);
  const focus = () => inputRef.current?.focus();

  return (
    <View>
      <Pressable onPress={focus} style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const filled = i < value.length;
          const active = i === value.length && value.length < length;
          return (
            <View
              key={i}
              style={[
                styles.box,
                active && styles.boxActive,
                filled && styles.boxFilled,
                error ? styles.boxError : null
              ]}
            >
              {filled ? (
                <Text variant="title" weight="bold" style={{ color: colors.primary }}>{value[i]}</Text>
              ) : (
                <View style={styles.dot} />
              )}
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChangeText={(v) => onChangeText(v.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        caretHidden
        selectionColor="transparent"
        style={styles.hidden}
        importantForAutofill="yes"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
      />
      {error ? (
        <Text variant="tiny" tone="danger" align="center" style={{ marginTop: space.xs }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const SIZE_W = 56;
const SIZE_H = 64;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.md
  },
  box: {
    width: SIZE_W,
    height: SIZE_H,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  boxActive: {
    borderColor: colors.primary
  },
  boxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint
  },
  boxError: { borderColor: colors.danger },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textMuted,
    opacity: 0.5
  },
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    top: 0,
    left: 0
  }
});

export const OtpInput = memo(OtpInputInner);
