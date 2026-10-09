import React from "react";
import { ActivityIndicator, Image, Pressable } from "react-native";
import { Text } from "./Text";
import { space } from "../tokens";

// Official Google identity asset. Source: https://developers.google.com/identity/images/g-logo.png
export function GoogleSignInButton({ onPress, busy, label }: { onPress: () => void; busy: boolean; label: string }) {
  return <Pressable onPress={onPress} disabled={busy} accessibilityRole="button" accessibilityState={{ disabled: busy, busy }}
    testID="google-sign-in" android_ripple={{ color: "rgba(0,0,0,0.06)" }}
    style={({ pressed }) => ({ minHeight: 54, paddingVertical: 12, paddingHorizontal: space.lg, gap: space.md, flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "#747775", backgroundColor: "#FFFFFF", opacity: pressed || busy ? 0.7 : 1 })}>
    {busy ? <ActivityIndicator color="#1F1F1F" /> : <Image source={require("../assets/google-g.png")} style={{ width: 22, height: 22 }} accessibilityIgnoresInvertColors />}
    <Text variant="body" weight="medium" style={{ color: "#1F1F1F", flexShrink: 1 }}>{label}</Text>
  </Pressable>;
}
