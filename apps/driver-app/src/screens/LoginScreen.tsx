import React, { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { AppHeader, Button, Card, Input, OtpInput, OtpToast, Screen, Text, colors, space } from "@jr/ui";
import { auth as authApi, setToken } from "../api";

// `EXPO_PUBLIC_*` env vars are inlined by Expo at bundle time; the accessor
// pattern avoids needing @types/node.
const env = ((typeof globalThis !== "undefined" ? (globalThis as any).process : undefined)?.env ?? {}) as Record<string, string | undefined>;
const PRIVACY_POLICY_URL =
  env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "http://localhost:3000/privacy";

const OTP_LENGTH = 4;

export function LoginScreen({ onAuthenticated }: { onAuthenticated: (profile: any) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const requestOtp = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await authApi.requestOtp(phone);
      const otp = (r.demoOtp ?? "").slice(0, OTP_LENGTH);
      setCode("");
      setStage("code");
      if (otp) {
        setToast(`OTP received  •  ${otp}`);
        setTimeout(() => setCode(otp), 380);
      } else {
        setToast("OTP sent to your mobile");
      }
    } catch (e: any) {
      setErr(e.message ?? "Could not send OTP.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await authApi.verifyOtp(phone, code);
      await setToken(r.accessToken);
      onAuthenticated(r.profile);
    } catch (e: any) {
      setErr(e.message ?? "Invalid OTP.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <AppHeader
          title={stage === "phone" ? "Driver sign in" : "Verify OTP"}
          subtitle={stage === "phone" ? "Enter your registered mobile" : `Sent to ${phone}`}
          onBack={stage === "code" ? () => { setCode(""); setErr(null); setStage("phone"); } : undefined}
        />
        <Card>
          <View style={{ gap: space.md }}>
            {stage === "phone" ? (
              <>
                <Input
                  label="Mobile number"
                  keyboardType="phone-pad"
                  autoFocus
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 99xxx xxxxx"
                  error={err ?? undefined}
                />
                <Button
                  label="Send OTP"
                  onPress={requestOtp}
                  loading={busy}
                  disabled={phone.replace(/\D/g, "").length < 10}
                  fullWidth
                  testID="send-otp"
                />
                <Text variant="tiny" tone="muted" align="center">
                  By continuing you agree to our{" "}
                  <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
                    <Text variant="tiny" weight="bold" style={{ color: colors.primary }}>
                      privacy policy
                    </Text>
                  </Pressable>
                  .
                </Text>
              </>
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
                  testID="verify-otp"
                />
                <Button label="Resend OTP" variant="ghost" onPress={requestOtp} disabled={busy} />
              </View>
            )}
          </View>
        </Card>
      </Screen>
      <OtpToast message={toast} onHide={() => setToast(null)} />
    </View>
  );
}
