import React, { memo, useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, animation, space } from "../tokens";

type Step = { key: string; label: string };

type Props = {
  steps: Step[];
  currentIndex: number;        // -1 = nothing started; 0 = first done; etc.
  failed?: boolean;            // renders muted/red state if cancelled or timed out
};

/**
 * 5-step progress strip used on Live tracking + driver Trip screens.
 * Pure RN — circles + connector line, no SVG. Active step pulses softly.
 */
function StepperInner({ steps, currentIndex, failed }: Props) {
  return (
    <View style={styles.row}>
      {steps.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <React.Fragment key={s.key}>
            <View style={styles.col}>
              <StepDot done={done} active={active} failed={!!failed} index={i} />
              <Text
                variant="tiny"
                tone={active ? "primary" : done ? "secondary" : "muted"}
                weight={active || done ? "semi" : "regular"}
                align="center"
                numberOfLines={1}
                style={{ marginTop: 6, maxWidth: 64 }}
              >
                {s.label}
              </Text>
            </View>
            {i < steps.length - 1 ? (
              <View
                style={[
                  styles.connector,
                  done ? { backgroundColor: failed ? colors.textMuted : colors.primary } : null
                ]}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function StepDot({ done, active, failed, index }: { done: boolean; active: boolean; failed: boolean; index: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.18, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const bg = failed && (done || active) ? colors.textMuted : done ? colors.primary : active ? colors.primary : colors.surface;
  const borderColor = done || active ? (failed ? colors.textMuted : colors.primary) : colors.borderStrong;
  const fg = done || active ? colors.textInverse : colors.textMuted;

  return (
    <View>
      {active && !failed ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            { transform: [{ scale: pulse }], borderColor: colors.primary }
          ]}
        />
      ) : null}
      <View style={[styles.dot, { backgroundColor: bg, borderColor }]}>
        <Text variant="tiny" weight="bold" style={{ color: fg }}>
          {done ? "✓" : String(index + 1)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: space.sm
  },
  col: { alignItems: "center", width: 64 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  pulseRing: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2,
    opacity: 0.35,
    top: 0,
    left: 0
  },
  connector: {
    flex: 1,
    height: 2,
    marginTop: 13,
    marginHorizontal: -2,
    backgroundColor: colors.border
  }
});

export const Stepper = memo(StepperInner);
