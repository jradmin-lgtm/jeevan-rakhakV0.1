import React, { useState } from "react";
import { Animated, Pressable, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { AppHeader, Button, Card, IconBadge, Input, OtpInput, OtpToast, PulseDot, Screen, Text, colors, space, useFadeIn } from "@jr/ui";
import { auth as authApi, setToken } from "../api";

// `EXPO_PUBLIC_*` env vars are inlined by Expo at bundle time; the accessor
// pattern avoids needing @types/node.
const env = ((typeof globalThis !== "undefined" ? (globalThis as any).process : undefined)?.env ?? {}) as Record<string, string | undefined>;
const PRIVACY_POLICY_URL =
  env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "http://localhost:3000/privacy";

const OTP_LENGTH = 4;

export function LoginOtpScreen({ onAuthenticated }: { onAuthenticated: (profile: any) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fade = useFadeIn();

  const requestOtp = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await authApi.requestOtp(phone, "user");
      // Pilot bypass: backend returns the OTP in `demoOtp` (last 4 of phone).
      // When real SMS is wired this branch goes silent; the toast simply
      // says "OTP sent" and the user enters the code from their SMS.
      const otp = (r.demoOtp ?? "").slice(0, OTP_LENGTH);
      // Hold on the phone screen for ~2.5s with the button-spinner showing so
      // it feels like a real "we're sending an SMS" beat before the toast
      // appears. Drop this delay when real SMS goes live — actual SMS arrival
      // takes 1–10s on its own.
      await new Promise((res) => setTimeout(res, 2500));
      setCode("");
      setStage("code");
      if (otp) {
        setToast(`OTP received  •  ${otp}`);
        // Brief delay so the user sees the toast first, then the boxes fill.
        setTimeout(() => setCode(otp), 420);
      } else {
        setToast("OTP sent to your mobile");
      }
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
    <View style={{ flex: 1 }}>
      <Screen>
        <AppHeader
          title={stage === "phone" ? "Sign in" : "Verify OTP"}
          subtitle={stage === "phone" ? "Enter your mobile number" : `Sent to ${phone}`}
          onBack={stage === "code" ? () => { setCode(""); setErr(null); setStage("phone"); } : undefined}
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
                <Pressable
                onPress={() =>
                  WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL, {
                    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
                    toolbarColor: colors.surface,
                    controlsColor: colors.primary
                  })
                }
              >
                  <Text variant="tiny" weight="bold" style={{ color: colors.primary }}>
                    privacy policy
                  </Text>
                </Pressable>
                .
              </Text>
            </View>
          ) : (
            <View style={{ gap: space.lg }}>
              <Text variant="small" tone="secondary" align="center">
                Enter the 4-digit code
              </Text>
              <OtpInput
                value={code}
                onChangeText={setCode}
                length={OTP_LENGTH}
                autoFocus
                error={err ?? undefined}
              />
              <Button
                label="Verify & continue"
                onPress={verifyOtp}
                loading={busy}
                disabled={code.length < OTP_LENGTH}
                fullWidth
                size="lg"
                testID="verify-otp"
              />
              <Button label="Resend OTP" variant="ghost" onPress={requestOtp} disabled={busy} />
            </View>
          )}
        </Card>
      </Screen>
      <OtpToast message={toast} onHide={() => setToast(null)} />
    </View>
  );
}
