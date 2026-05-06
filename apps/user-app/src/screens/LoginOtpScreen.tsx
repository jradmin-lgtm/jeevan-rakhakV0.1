import React, { useState } from "react";
import { Animated, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, PulseDot, Screen, Text, colors, space, useFadeIn } from "@jr/ui";
import { auth as authApi, setToken } from "../api";

export function LoginOtpScreen({ onAuthenticated }: { onAuthenticated: (profile: any) => void }) {
  const [phone, setPhone] = useState("+919888100099");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fade = useFadeIn();

  const requestOtp = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await authApi.requestOtp(phone, "user");
      setDemoOtp(r.demoOtp ?? null);
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
        onBack={stage === "code" ? () => setStage("phone") : undefined}
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
              fullWidth
              size="lg"
              testID="send-otp"
            />
            <Text variant="tiny" tone="muted" align="center">
              By continuing you agree to our terms and privacy policy.
            </Text>
          </View>
        ) : (
          <View style={{ gap: space.md }}>
            <Input
              label="6-digit OTP"
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              value={code}
              onChangeText={setCode}
              placeholder="••••••"
              error={err ?? undefined}
            />
            {demoOtp ? (
              <Text variant="small" tone="secondary" align="center">
                Demo OTP: <Text weight="bold">{demoOtp}</Text>
              </Text>
            ) : null}
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
