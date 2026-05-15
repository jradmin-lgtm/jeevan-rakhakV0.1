import React, { useState } from "react";
import { Animated, Linking, Pressable, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, PulseDot, Screen, Text, colors, space, useFadeIn } from "@jr/ui";
import { auth as authApi, setToken } from "../api";

// `EXPO_PUBLIC_*` env vars are inlined by Expo at bundle time; the accessor
// pattern avoids needing @types/node.
const env = ((typeof globalThis !== "undefined" ? (globalThis as any).process : undefined)?.env ?? {}) as Record<string, string | undefined>;
const PRIVACY_POLICY_URL =
  env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "http://localhost:3000/privacy";

export function LoginOtpScreen({ onAuthenticated }: { onAuthenticated: (profile: any) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fade = useFadeIn();

  const requestOtp = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await authApi.requestOtp(phone, "user");
      // Pilot: backend's FLAG_PILOT_BYPASS_OTP makes the code = last 4 digits
      // of the phone, returned as `demoOtp`. Pre-fill it so the user just taps
      // Verify. When real SMS is wired, drop the prefill and let the user
      // enter the code they received.
      const prefill = r.demoOtp ?? phone.replace(/\D/g, "").slice(-4);
      setCode(prefill);
      setStage("code");
    } catch (e: any) {
      setErr(e.message ?? "Could not send OTP. Check your phone number.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await authApi.verifyOtp(phone, "user", code);
      await setToken(r.accessToken);
      onAuthenticated(r.profile);
    } catch (e: any) {
      setErr(e.message ?? "Invalid OTP. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title={stage === "phone" ? "Sign in" : "Verify OTP"}
        subtitle={stage === "phone" ? "Enter your mobile number" : `Sent to ${phone}`}
        onBack={stage === "code" ? () => { setCode(""); setStage("phone"); } : undefined}
      />

      <Animated.View style={[fade, { alignItems: "center", paddingVertical: space.md }]}>
        {stage === "phone" ? (
          <IconBadge glyph="✚" size={72} bg={colors.primaryFaint} color={colors.primary} />
        ) : (
          <View style={{ alignItems: "center", justifyContent: "center", height: 72 }}>
            <PulseDot size={32} color={colors.primary} rings={2} />
          </View>
        )}
      </Animated.View>

      <Card>
        {stage === "phone" ? (
          <View style={{ gap: space.md }}>
            <Input
              label="Mobile number"
              keyboardType="phone-pad"
              autoFocus
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98xxx xxxxx"
              error={err ?? undefined}
            />
            <Button
              label="Send OTP"
              onPress={requestOtp}
              loading={busy}
              disabled={phone.replace(/\D/g, "").length < 10}
              fullWidth
              size="lg"
              testID="send-otp"
            />
            <Text variant="tiny" tone="muted" align="center">
              By continuing you agree to our{" "}
              <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
                <Text variant="tiny" tone="primary" weight="bold">
                  privacy policy
                </Text>
              </Pressable>
              .
            </Text>
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <Input
              label="Enter OTP"
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              value={code}
              onChangeText={setCode}
              placeholder="••••"
              error={err ?? undefined}
            />
            <Button
              label="Verify & continue"
              onPress={verifyOtp}
              loading={busy}
              disabled={code.length < 4}
              fullWidth
              size="lg"
              testID="verify-otp"
            />
            <Button label="Resend OTP" variant="ghost" onPress={requestOtp} disabled={busy} />
          </View>
        )}
      </Card>
    </Screen>
  );
}
