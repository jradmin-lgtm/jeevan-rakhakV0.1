import React, { useState } from "react";
import { Animated, Linking, Pressable, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, OtpInput, OtpToast, PulseDot, Screen, Text, colors, space, useFadeIn } from "@jr/ui";
import { auth as authApi, setToken } from "../api";
import { useT } from "../i18n";

// Metro inlines `process.env.EXPO_PUBLIC_*` at bundle time only on direct
// access. Indirect access leaves the value undefined on native Android.
declare const process: { env: Record<string, string | undefined> };
const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "https://jr-admin.vercel.app/privacy";

const OTP_LENGTH = 4;

export function LoginOtpScreen({ onAuthenticated }: { onAuthenticated: (profile: any) => void }) {
  const { t, lang, setLang } = useT();
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
                label={t("login.mobile")}
                keyboardType="phone-pad"
                autoFocus
                value={phone}
                onChangeText={setPhone}
                placeholder="+91 98xxx xxxxx"
                error={err ?? undefined}
              />
              <Button
                label={t("login.send_otp")}
                onPress={requestOtp}
                loading={busy}
                disabled={phone.replace(/\D/g, "").length < 10}
                fullWidth
                size="lg"
                testID="send-otp"
              />
              {/* Privacy policy on its own line so Hindi text doesn't wrap
                * mid-link — inline `<Pressable>` inside `<Text>` on Android
                * renders strikethrough artifacts when the parent wraps over
                * multiple lines (visible in Hindi where the agreement text
                * is longer than English). */}
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
              <Button label={t("otp.resend")} variant="ghost" onPress={requestOtp} disabled={busy} />
            </View>
          )}
        </Card>

        <View style={{ marginTop: space.xl, gap: space.xs, alignItems: "center" }}>
          <Text variant="tiny" tone="muted" align="center">
            {t("login.footer_care")}
          </Text>
          <Text variant="tiny" tone="muted" align="center">
            {t("login.driver_hint")}
          </Text>
        </View>
      </Screen>
      <OtpToast message={toast} onHide={() => setToast(null)} />
    </View>
  );
}
