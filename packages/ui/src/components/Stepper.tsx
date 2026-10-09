import React, { memo } from "react";
import { View } from "react-native";
import { Text } from "./Text";
import { colors } from "../tokens";

type Props = { steps: { key: string; label: string }[]; currentIndex: number; failed?: boolean };
function StepperInner({ steps, currentIndex, failed }: Props) {
  return <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: steps.length, now: Math.max(0, currentIndex + 1) }}>
    {steps.map((step, index) => {
      const reached = !failed && index <= currentIndex;
      return <View key={step.key} style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ height: 3, borderRadius: 2, backgroundColor: reached ? colors.textPrimary : colors.border }} />
        <Text variant="tiny" tone={reached ? "primary" : "secondary"} weight={index === currentIndex ? "bold" : "regular"}>{step.label}</Text>
      </View>;
    })}
  </View>;
}
export const Stepper = memo(StepperInner);
