import React, { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { AppHeader, Button, Card, Input, OtpInput, OtpToast, Screen, Text, colors, space } from "@jr/ui";
import { auth as authApi, setToken } from "../api";
import { useT } from "../i18n";

// Metro inlines `process.env.EXPO_PUBLIC_*` at bundle time only on direct
// access. Indirect access leaves the value undefined on native Android.
declare const process: { env: Record<string, string | undefined> };
const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "https://jr-admin.vercel.app/privacy";

const OTP_LENGTH = 4;

export function LoginScreen({ onAuthenticated }: { onAuthenticated: (profile: any) => void }) {
  const { t, lang, setLang } = useT();
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
      await new Promise((res) => setTimeout(res, 2500));
      setCode("");
      setStage("code");
      if (otp) {
        setToast(`OTP received  •  ${otp}`);
        setTimeout(() => setCode(otp), 420);
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
          title={stage === "phone" ? t("login.title") : t("otp.title")}
          subtitle={stage === "phone" ? t("login.subtitle") : `${t("otp.subtitle")} ${phone}`}
          onBack={stage === "code" ? () => { setCode(""); setErr(null); setStage("phone"); } : undefined}
          right={stage === "phone" ? (
            <Pressable
              onPress={() => void setLang(lang === "en" ? "hi" : "en")}
              accessibilityLabel="Switch language"
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(30,94,255,0.10)", borderRadius: 999 }}
            >
              <Text variant="small" weight="bold" style={{ color: lang === "en" ? colors.accent : "#94A3B8" }}>EN</Text>
              <Text variant="small" tone="muted">|</Text>
              <Text variant="small" weight="bold" style={{ color: lang === "hi" ? colors.accent : "#94A3B8" }}>हि</Text>
            </Pressable>
          ) : undefined}
        />
        <Card>
          <View style={{ gap: space.md }}>
            {stage === "phone" ? (
              <>
                <Input
                  label={t("login.mobile")}
                  keyboardType="phone-pad"
                  autoFocus
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 99xxx xxxxx"
                  error={err ?? undefined}
                />
                <Button
                  label={t("login.send_otp")}
                  onPress={requestOtp}
                  loading={busy}
                  disabled={phone.replace(/\D/g, "").length < 10}
                  fullWidth
                  testID="send-otp"
                />
                {/* Privacy policy on its own line — see user-app for rationale */}
                <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
                  <Text variant="tiny" tone="muted" align="center">
                    {t("login.agree")}
                  </Text>
                  <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
                    <Text variant="tiny" weight="bold" style={{ color: colors.primary }}>
                      {t("login.privacy")}
                    </Text>
                  </Pressable>
                </View>
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
                  label={t("otp.verify")}
                  onPress={verifyOtp}
                  loading={busy}
                  disabled={code.length < OTP_LENGTH}
                  fullWidth
                  testID="verify-otp"
                />
                <Button label={t("otp.resend")} variant="ghost" onPress={requestOtp} disabled={busy} />
              </View>
            )}
          </View>
        </Card>

        <View style={{ marginTop: space.xl, gap: space.xs, alignItems: "center" }}>
          <Text variant="tiny" tone="muted" align="center">
            {t("login.footer_care")}
          </Text>
          <Text variant="tiny" tone="muted" align="center">
            {t("login.patient_hint")}
          </Text>
        </View>
      </Screen>
      <OtpToast message={toast} onHide={() => setToast(null)} />
    </View>
  );
}
