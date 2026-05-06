import React, { useState } from "react";
import { View } from "react-native";
import { AppHeader, Button, Card, Input, Screen, Text, space } from "@jr/ui";
import { auth as authApi, setToken } from "../api";

export function LoginScreen({ onAuthenticated }: { onAuthenticated: (profile: any) => void }) {
  const [phone, setPhone] = useState("+919999000001");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const requestOtp = async () => {
    setErr(null);
    setBusy(true);
    try {
      const r = await authApi.requestOtp(phone);
      setDemoOtp(r.demoOtp ?? null);
      setStage("code");
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
    <Screen>
      <AppHeader
        title={stage === "phone" ? "Driver sign in" : "Verify OTP"}
        subtitle={stage === "phone" ? "Enter your registered mobile" : `Sent to ${phone}`}
        onBack={stage === "code" ? () => setStage("phone") : undefined}
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
              <Button label="Send OTP" onPress={requestOtp} loading={busy} fullWidth testID="send-otp" />
              <Text variant="tiny" tone="muted" align="center">
                Demo seed numbers: +919999000001, +919999000002, +919999000003
              </Text>
            </>
          ) : (
            <>
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
              <Button label="Verify & continue" onPress={verifyOtp} loading={busy} disabled={code.length < 4} fullWidth testID="verify-otp" />
              <Button label="Resend OTP" variant="ghost" onPress={requestOtp} disabled={busy} />
            </>
          )}
        </View>
      </Card>
    </Screen>
  );
}
