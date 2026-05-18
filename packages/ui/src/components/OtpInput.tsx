import React, { memo, useEffect, useRef } from "react";
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

  // v1.0.11: focus once on mount via useEffect instead of the TextInput's
  // `autoFocus` prop. Team reported the keyboard disappearing mid-entry on
  // Android — the prop was re-triggering focus behavior on every parent
  // re-render (TripScreen polls booking state every few seconds). useEffect
  // with empty deps fires exactly once, then we leave focus management to
  // the user's taps on the visual boxes.
  useEffect(() => {
    if (autoFocus) {
      // Tiny delay lets the layout settle before showing the soft keyboard;
      // without it Android sometimes shows the keyboard, then hides it
      // immediately when the parent's first layout pass completes.
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  // Only refocus from a tap if we're not already focused — avoids the
  // blur→refocus cycle that briefly dismisses the soft keyboard.
  const handleBoxesPress = () => {
    if (!inputRef.current?.isFocused?.()) {
      inputRef.current?.focus();
    }
  };

  return (
    <View>
      <Pressable onPress={handleBoxesPress} style={styles.row}>
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

// v1.0.14: the OtpInput used to hard-code 56×64dp boxes. On narrow devices
// (~320dp width, e.g. older Androids and split-screen mode) four boxes
// overflowed the parent and pushed the right-most box off-screen. We now
// flex each box to share the available width with a sensible max so they
// don't grow obnoxiously on tablets.
const BOX_MIN_W = 48;
const BOX_MAX_W = 64;
const BOX_HEIGHT = 64;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    gap: space.sm
  },
  box: {
    flex: 1,
    minWidth: BOX_MIN_W,
    maxWidth: BOX_MAX_W,
    height: BOX_HEIGHT,
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
