import React, { useState } from "react";
import { Animated, Image, Pressable, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, Screen, Text, colors, radius, space, useFadeIn, switchGoogleAccount, JrGoogleSignInError } from "@jr/ui";
import { auth as authApi, setToken } from "../api";
import { useT } from "../i18n";

type GoogleProfile = {
  email: string;
  name: string | null;
  picture: string | null;
  sub: string;
};

type Props = {
  idToken: string;
  google: GoogleProfile;
  onSetupComplete: (profile: any) => void;
  onBack: () => void;
};

/**
 * v1.0.13 — shown after the first-ever Google sign-in for a user we don't
 * have a row for. Captures the two pieces Google can't give us (phone)
 * and one we want to confirm even if Google supplied it (name).
 *
 * Visually mirrors `NameCaptureScreen` (the old post-OTP screen): same
 * AppHeader pattern, same IconBadge, same single-card form. Adds a small
 * "Signed in as <email>" chip so the user knows which Google account they
 * just picked.
 */
export function ProfileSetupScreen({ idToken, google, onSetupComplete, onBack }: Props) {
  const { t } = useT();
  // Local copies so "Switch Google account" can swap the active account in
  // place (CR#1) without bouncing back to the login screen.
  const [g, setG] = useState<GoogleProfile>(google);
  const [tok, setTok] = useState(idToken);
  const [name, setName] = useState(google.name ?? "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fade = useFadeIn();

  const canSubmit = name.trim().length >= 2 && phone.replace(/\D/g, "").length >= 10;

  // CR#1: reopen the Google account picker and re-run the start handshake.
  // If the freshly-picked account is already a full user, sign straight in;
  // otherwise update the in-screen account being registered.
  const switchAccount = async () => {
    setErr(null);
    setSwitching(true);
    try {
      const res = await switchGoogleAccount();
      const r = await authApi.googleStart(res.idToken, "user");
      if (r.needsProfile) {
        setG(r.googleProfile);
        setTok(res.idToken);
        setName(r.googleProfile?.name ?? "");
      } else if (r.accessToken) {
        await setToken(r.accessToken);
        onSetupComplete(r.profile);
      }
    } catch (e) {
      const code = e instanceof JrGoogleSignInError ? e.code : null;
      if (code !== "cancelled") setErr(t("auth.google.error_generic"));
    } finally {
      setSwitching(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await authApi.googleComplete({ idToken: tok, role: "user", phone, name: name.trim() });
      await setToken(r.accessToken);
      onSetupComplete(r.profile);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("phone_already_used")) {
        setErr(t("auth.google.error_phone_used"));
      } else if (msg.includes("email_already_used")) {
        setErr(t("auth.google.error_email_used"));
      } else {
        setErr(e?.message ?? t("auth.google.error_generic"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title={t("profile_setup.title")} subtitle={t("profile_setup.subtitle")} onBack={onBack} />

      <Animated.View style={[fade, { alignItems: "center", paddingVertical: space.md, gap: space.sm }]}>
        {g.picture ? (
          <Image source={{ uri: g.picture }} style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primaryFaint }} />
        ) : (
          <IconBadge glyph="✓" size={84} bg={colors.primaryFaint} color={colors.primary} />
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: space.md,
            paddingVertical: 4,
            borderRadius: radius.pill,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border
          }}
        >
          <Text variant="tiny" tone="muted">{t("profile_setup.signed_in_as")}</Text>
          <Text variant="tiny" weight="bold" style={{ color: colors.textPrimary }}>{g.email}</Text>
        </View>
        <Pressable onPress={switchAccount} disabled={switching || busy} hitSlop={8}>
          <Text variant="tiny" weight="bold" align="center" style={{ color: switching || busy ? "#94A3B8" : colors.accent }}>
            {switching ? t("auth.google.busy") : t("auth.google.switch_account")}
          </Text>
        </Pressable>
      </Animated.View>

      <Card>
        <View style={{ gap: space.md }}>
          <Input
            label={t("profile_setup.name_label")}
            placeholder={t("profile_setup.name_placeholder")}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus={!google.name}
            testID="profile-setup-name"
          />
          <Input
            label={t("profile_setup.phone_label")}
            placeholder={t("profile_setup.phone_placeholder")}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoFocus={!!google.name}
            error={err ?? undefined}
            testID="profile-setup-phone"
          />
          <Text variant="tiny" tone="muted">{t("profile_setup.phone_help")}</Text>
          <Button
            label={t("profile_setup.continue")}
            onPress={submit}
            loading={busy}
            disabled={!canSubmit || busy}
            fullWidth
            size="lg"
            testID="profile-setup-continue"
          />
        </View>
      </Card>
    </Screen>
  );
}
