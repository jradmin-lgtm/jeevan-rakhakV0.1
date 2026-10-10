import React from "react";
import { View } from "react-native";
import { colors } from "../tokens";

/** Decorative vehicle silhouette; all meaning remains in the adjacent text. */
export function AmbulanceMark({ size = 72 }: { size?: number }) {
  const s = size / 72;
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: 44 * s }}>
    <View style={{ position: "absolute", left: 4*s, right: 1*s, bottom: 3*s, height: 4*s, borderRadius: 5*s, backgroundColor: colors.border }} />
    <View style={{ position: "absolute", left: 3*s, top: 6*s, width: 44*s, height: 29*s, borderRadius: 5*s, backgroundColor: colors.surface, borderWidth: 1.5*s, borderColor: colors.textPrimary }} />
    <View style={{ position: "absolute", left: 46*s, top: 14*s, width: 23*s, height: 21*s, borderTopRightRadius: 10*s, borderBottomRightRadius: 4*s, backgroundColor: colors.surface, borderWidth: 1.5*s, borderColor: colors.textPrimary }} />
    <View style={{ position: "absolute", left: 50*s, top: 17*s, width: 13*s, height: 8*s, borderTopRightRadius: 6*s, backgroundColor: colors.borderStrong }} />
    <View style={{ position: "absolute", left: 5*s, top: 28*s, width: 61*s, height: 4*s, backgroundColor: colors.primary }} />
    <View style={{ position: "absolute", left: 21*s, top: 11*s, width: 5*s, height: 13*s, backgroundColor: colors.primary }} />
    <View style={{ position: "absolute", left: 17*s, top: 15*s, width: 13*s, height: 5*s, backgroundColor: colors.primary }} />
    <View style={{ position: "absolute", left: 50*s, top: 9*s, width: 8*s, height: 5*s, borderTopLeftRadius: 3*s, borderTopRightRadius: 3*s, backgroundColor: colors.primary }} />
    {[13, 53].map(x => <View key={x} style={{ position: "absolute", left: x*s, top: 30*s, width: 11*s, height: 11*s, borderRadius: 6*s, backgroundColor: colors.textPrimary, borderWidth: 3*s, borderColor: colors.textPrimary }}><View style={{ flex: 1, borderRadius: 4*s, backgroundColor: colors.surface }} /></View>)}
  </View>;
}
