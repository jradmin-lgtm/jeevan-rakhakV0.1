import { GoogleSignInButton } from "@jr/ui";
import React, { useState } from "react";
import { ActivityIndicator, Animated, Linking, Pressable, View } from "react-native";
import {
  AppHeader,
  Card,
  IconBadge,
  JrGoogleSignInError,
  Screen,
  Text,
  colors,
  radius,
  space,
  signInWithGoogle,
  switchGoogleAccount,
  useFadeIn
} from "@jr/ui";
import { auth as authApi, setToken } from "../api";
import { useT } from "../i18n";

declare const process: { env: Record<string, string | undefined> };
const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "https://jr-admin.vercel.app/privacy";

type Stage = { kind: "idle" } | { kind: "google_busy" };

type Props = {
  onAuthenticated: (profile: any) => void;
  onProfileSetupRequired: (input: {
    idToken: string;
    google: { email: string; name: string | null; picture: string | null; sub: string };
  }) => void;
};

/**
 * Driver app v1.0.13 Google Sign-In — same shape as user app's
 * GoogleLoginScreen but uses driver-specific copy and posts role=driver.
 * On first-time signup the driver app routes profile-setup → KYC instead
 * of straight to Home.
 */
export function GoogleLoginScreen({ onAuthenticated, onProfileSetupRequired }: Props) {
  const { t, lang, setLang } = useT();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [err, setErr] = useState<string | null>(null);
  const fade = useFadeIn();

  // Shared runner — `picker` is signInWithGoogle (reuses cached account) or
  // switchGoogleAccount (signs out first so the chooser reopens — CR#5A).
  const runGoogle = async (picker: typeof signInWithGoogle) => {
    setErr(null);
    setStage({ kind: "google_busy" });
    try {
      const googleResult = await picker();
      const r = await authApi.googleStart(googleResult.idToken);
      if (r.needsProfile) {
        onProfileSetupRequired({ idToken: googleResult.idToken, google: r.googleProfile });
        setStage({ kind: "idle" });
        return;
      }
      if (r.accessToken) {
        await setToken(r.accessToken);
        onAuthenticated(r.profile);
      } else { throw new Error("Sign-in response is missing the access token"); }
    } catch (e) {
      const code = e instanceof JrGoogleSignInError ? e.code : null;
      if (code === "cancelled") {
        setStage({ kind: "idle" });
        return;
      }
      if (code === "play_services_unavailable") {
        setErr(t("auth.google.error_play_services"));
      } else {
        const msg = (e as any)?.message ?? "";
        if (msg.includes("email_already_used")) {
          setErr(t("auth.google.error_email_used"));
        } else {
          // 2026-08-10: append the raw detail (native error code, when this
          // came from the "unknown" bucket in googleSignIn.ts) so a failure
          // we haven't seen before is diagnosable from a screenshot instead
          // of another hours-long investigation like the v2.1.0 incident.
          setErr(msg ? `${t("auth.google.error_generic")} (${msg})` : t("auth.google.error_generic"));
        }
      }
      setStage({ kind: "idle" });
    }
  };

  const onPressSignIn = () => void runGoogle(signInWithGoogle);
  const onPressSwitch = () => void runGoogle(switchGoogleAccount);

  const busy = stage.kind === "google_busy";

  return (
    <Screen bg={colors.surface} style={{ flexGrow: 1 }}>
      <AppHeader
        title="Jeevan Rakshak"
        subtitle={t("auth.google.app_role")}
        right={
          <Pressable
            onPress={() => void setLang(lang === "en" ? "hi" : "en")}
            accessibilityLabel={t("common.switch_language")}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 8,
              minHeight: 44,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              borderRadius: 999
            }}
          >
            <Text variant="small" weight="bold" style={{ color: lang === "en" ? colors.accent : colors.textMuted }}>EN</Text>
            <Text variant="small" tone="muted">|</Text>
            <Text variant="small" weight="bold" style={{ color: lang === "hi" ? colors.accent : colors.textMuted }}>हि</Text>
          </Pressable>
        }
      />

      <Animated.View style={[fade, { alignItems: "flex-start", paddingVertical: space.xl, gap: space.lg }]}>
        <IconBadge glyph="+" size={48} bg={colors.primaryFaint} color={colors.primary} />
        <Text variant="title" style={{ maxWidth: 320 }}>{t("auth.google.hero")}</Text>
        <Text variant="body" tone="secondary">{t("auth.google.hero_hint")}</Text>
      </Animated.View>

      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.lg }}>
          <Text variant="small" tone="secondary" align="center">{t("auth.google.why_google")}</Text>

          <GoogleSignInButton onPress={onPressSignIn} busy={busy} label={busy ? t("auth.google.busy") : t("auth.google.button")} />

          <Pressable onPress={onPressSwitch} disabled={busy} accessibilityRole="button" style={{ minHeight: 48, justifyContent: "center" }}>
            <Text variant="small" weight="bold" align="center" style={{ color: busy ? colors.textMuted : colors.accent }}>
              {t("auth.google.switch_account")}
            </Text>
          </Pressable>

          {err ? (
            <View style={{ paddingHorizontal: space.sm }}>
              <Text variant="small" tone="danger" align="center">{err}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Text variant="tiny" tone="muted" align="center">{t("login.agree")}</Text>
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(error => { console.error("Privacy policy could not open", error); setErr(t("auth.google.link_failed")); })} style={{ minHeight: 44, justifyContent: "center" }}>
              <Text variant="tiny" weight="bold" style={{ color: colors.primary }}>{t("login.privacy")}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={{ marginTop: space.xl, gap: space.xs, alignItems: "center" }}>
        <Text variant="tiny" tone="muted" align="center">{t("login.footer_care")}</Text>
        <Text variant="tiny" tone="muted" align="center">{t("login.patient_hint")}</Text>
      </View>
    </Screen>
  );
}
