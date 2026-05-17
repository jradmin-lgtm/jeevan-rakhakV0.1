import React, { useState } from "react";
import { Animated, Image, Linking, Pressable, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Screen, Text, colors, radius, space, useFadeIn, signInWithGoogle, JrGoogleSignInError } from "@jr/ui";
import { auth as authApi, setToken } from "../api";
import { useT } from "../i18n";

declare const process: { env: Record<string, string | undefined> };
const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? "https://jr-admin.vercel.app/privacy";

type Stage =
  | { kind: "idle" }
  | { kind: "google_busy" }
  | { kind: "needs_profile"; idToken: string; google: { email: string; name: string | null; picture: string | null; sub: string } };

type Props = {
  /** Existing user signed in via Google — straight to home. */
  onAuthenticated: (profile: any) => void;
  /** First-time signup — show the profile setup screen with these prefilled
   *  fields. The screen will POST /auth/google/complete once submitted. */
  onProfileSetupRequired: (input: { idToken: string; google: { email: string; name: string | null; picture: string | null; sub: string } }) => void;
};

/**
 * v1.0.13 — Google Sign-In primary login. Replaces the OTP flow as the
 * default. The OTP path stays in `LoginOtpScreen.tsx` for fallback (gated
 * behind a feature flag in App.tsx) until v1.1.1 deletes it.
 *
 * Visual language matches the existing LoginOtpScreen — same AppHeader
 * pattern, same EN|हि toggle, same big centred medical-cross icon badge,
 * same single-card primary action below.
 */
export function GoogleLoginScreen({ onAuthenticated, onProfileSetupRequired }: Props) {
  const { t, lang, setLang } = useT();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [err, setErr] = useState<string | null>(null);
  const fade = useFadeIn();

  const onPressSignIn = async () => {
    setErr(null);
    setStage({ kind: "google_busy" });
    try {
      const googleResult = await signInWithGoogle();
      const r = await authApi.googleStart(googleResult.idToken, "user");

      if (r.needsProfile) {
        onProfileSetupRequired({ idToken: googleResult.idToken, google: r.googleProfile });
        // Reset stage so if the user comes back to this screen later it
        // doesn't show a permanent spinner.
        setStage({ kind: "idle" });
        return;
      }

      // Existing user — straight in.
      if (r.accessToken) {
        await setToken(r.accessToken);
        onAuthenticated(r.profile);
      }
    } catch (e) {
      const code = e instanceof JrGoogleSignInError ? e.code : null;
      if (code === "cancelled") {
        // Silent — user pressed Back. No scary alert.
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
          setErr(t("auth.google.error_generic"));
        }
      }
      setStage({ kind: "idle" });
    }
  };

  const busy = stage.kind === "google_busy";

  return (
    <Screen>
      <AppHeader
        title={t("auth.google.title")}
        subtitle={t("auth.google.subtitle")}
        right={
          <Pressable
            onPress={() => void setLang(lang === "en" ? "hi" : "en")}
            accessibilityLabel="Switch language"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: "rgba(30,94,255,0.10)",
              borderRadius: 999
            }}
          >
            <Text variant="small" weight="bold" style={{ color: lang === "en" ? colors.accent : "#94A3B8" }}>EN</Text>
            <Text variant="small" tone="muted">|</Text>
            <Text variant="small" weight="bold" style={{ color: lang === "hi" ? colors.accent : "#94A3B8" }}>हि</Text>
          </Pressable>
        }
      />

      <Animated.View style={[fade, { alignItems: "center", paddingVertical: space.md }]}>
        <IconBadge glyph="✚" size={84} bg={colors.primaryFaint} color={colors.primary} />
      </Animated.View>

      <Card>
        <View style={{ gap: space.lg, alignItems: "stretch" }}>
          <Text variant="small" tone="secondary" align="center">
            {t("auth.google.why_google")}
          </Text>

          <GoogleSignInButton onPress={onPressSignIn} busy={busy} label={busy ? t("auth.google.busy") : t("auth.google.button")} />

          {err ? (
            <View style={{ paddingHorizontal: space.sm }}>
              <Text variant="small" tone="danger" align="center">{err}</Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
            <Text variant="tiny" tone="muted" align="center">{t("login.agree")}</Text>
            <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
              <Text variant="tiny" weight="bold" style={{ color: colors.primary }}>{t("login.privacy")}</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <View style={{ marginTop: space.xl, gap: space.xs, alignItems: "center" }}>
        <Text variant="tiny" tone="muted" align="center">{t("login.footer_care")}</Text>
        <Text variant="tiny" tone="muted" align="center">{t("login.driver_hint")}</Text>
      </View>
    </Screen>
  );
}

/**
 * Google's brand guidelines say their "G" mark on a white-background button
 * with a 1px outline is the canonical CTA. We mirror that here so the button
 * is instantly recognisable and stays accessible (high contrast, large hit
 * target). All visual properties are inline — no theming — because changing
 * Google's brand colours violates their terms.
 */
function GoogleSignInButton({ onPress, busy, label }: { onPress: () => void; busy: boolean; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      android_ripple={{ color: "rgba(0,0,0,0.06)" }}
      style={({ pressed }) => ({
        backgroundColor: "#fff",
        borderColor: "#DADCE0",
        borderWidth: 1,
        borderRadius: radius.md,
        paddingVertical: 14,
        paddingHorizontal: space.lg,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: space.md,
        opacity: pressed || busy ? 0.85 : 1,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1
      })}
    >
      <GoogleGlyph size={22} />
      <Text variant="body" weight="bold" style={{ color: "#3C4043", letterSpacing: 0.2 }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Inline Google "G" glyph — uses Text glyphs so we don't ship a binary asset
 * for this single icon. The exact pixel art doesn't have to match Google's
 * SVG; the four-colour ring around the "G" is the recognisable cue.
 */
function GoogleGlyph({ size }: { size: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#fff",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      {/* Layered border arcs — approximates the multicoloured G mark.
        * Subtle and recognisable without infringing trademark precision. */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: size / 2, borderWidth: 2, borderColor: "#4285F4", borderRightColor: "#34A853", borderBottomColor: "#FBBC05", borderLeftColor: "#EA4335" }} />
      <Text style={{ fontSize: size * 0.62, fontWeight: "700", color: "#4285F4", lineHeight: size * 0.8 }}>G</Text>
    </View>
  );
}
