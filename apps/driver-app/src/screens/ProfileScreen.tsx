import React, { useState } from "react";
import { Pressable, Share, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, Pill, Screen, Text, colors, dialog, space } from "@jr/ui";
import { me } from "../api";
import { useT, setLang, type Lang } from "../i18n";
import { LangToggle } from "../components/LangToggle";

// Goes through the admin-web /qr redirector (not /download-apk directly) so
// it can be repointed later (custom domain, Play Store, etc.) without this
// already-shipped share text ever going stale.
const SHARE_LINK = "https://jr-admin.vercel.app/qr";

type Props = {
  initial: any;
  onBack: () => void;
  onUpdated: (profile: any) => void;
  onManageDocuments: () => void;
};

export function ProfileScreen({ initial, onBack, onUpdated, onManageDocuments }: Props) {
  const { t, lang } = useT();
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [busy, setBusy] = useState(false);

  const switchLang = (next: Lang) => {
    void setLang(next);
  };

  const shareApp = async () => {
    try {
      await Share.share({ message: t("share.message").replace("{link}", SHARE_LINK) });
    } catch (error: any) {
      console.warn("driver_profile_share_failed", error?.message);
      void dialog.alert(lang === "hi" ? "शेयर नहीं हुआ" : "Could not share", lang === "hi" ? "फिर कोशिश करें।" : "Please try again.");
    }
  };

  const save = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const r = await me.update({ name: name.trim() });
      onUpdated(r.profile);
      void dialog.alert(t("profile.saved_title"), t("profile.saved_body"));
      onBack();
    } catch (e: any) {
      void dialog.alert(t("profile.save_error_title"), e?.message ?? t("profile.save_error_body"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      header={<AppHeader title={t("profile.header_title")} subtitle={t("profile.header_subtitle")} onBack={onBack} right={<LangToggle />} />}
      footer={<Button label={t("profile.save_changes")} onPress={save} loading={busy} disabled={busy || !name.trim()} fullWidth size="lg" testID="save-profile" />}
    >

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("profile.section_editable")}</Text>
          <Input label={t("profile_setup.name_label")} value={name} onChangeText={setName} placeholder={t("profile.name_placeholder_hint")} />
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("profile.section_account")}</Text>
          <Row label={t("profile.row_phone")} value={initial?.phone ?? "·"} />
          <Row label={t("profile.row_driver_id")} value={initial?.id ? `${initial.id.slice(0, 8)}…` : "·"} />
          <Row label={t("profile.row_rating")} value={initial?.ratingCount > 0 && Number.isFinite(initial?.rating) ? initial.rating.toFixed(1) : (lang === "hi" ? "अभी कोई रेटिंग नहीं" : "No ratings yet")} />
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="label" tone="secondary">{t("profile.section_vehicle_kyc")}</Text>
            <Pill
              label={initial?.kycVerified ? t("profile.kyc_verified") : t("profile.kyc_pending")}
              color={initial?.kycVerified ? colors.success : colors.warning}
              bg={initial?.kycVerified ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.15)"}
            />
          </View>
          <Row label={t("profile.row_vehicle_number")} value={initial?.vehicleNumber ?? t("profile.not_on_file")} />
          <Row label={t("kyc.field.vehicle_type")} value={initial?.vehicleType ?? t("profile.not_on_file")} />
          <Row label={t("profile.row_licence")} value={initial?.licenseNumber ?? t("profile.not_on_file")} />
          <Text variant="tiny" tone="muted">
            {t("profile.vehicle_update_note")}
          </Text>
          <Button label={t("profile.manage_documents")} variant="outline" onPress={onManageDocuments} fullWidth />
        </View>
      </Card>

      {/* v1.0.15: in-app language toggle. Mirrors the user-app picker so a
        * driver who reads Hindi can flip and see Dashboard / Trip / Trip
        * History / map picker rendered in Hindi (where strings are wired). */}
      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{lang === "hi" ? "भाषा" : "Language"}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable
              accessibilityRole="radio" accessibilityState={{ checked: lang === "en" }}
              onPress={() => switchLang("en")}
              style={[langStyles.pill, lang === "en" && langStyles.pillActive]}
              android_ripple={{ color: "rgba(229,50,43,0.1)" }}
            >
              <Text variant="body" weight="semi" tone={lang === "en" ? "primary" : "secondary"}>
                {t("lang.english") || "English"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio" accessibilityState={{ checked: lang === "hi" }}
              onPress={() => switchLang("hi")}
              style={[langStyles.pill, lang === "hi" && langStyles.pillActive]}
              android_ripple={{ color: "rgba(229,50,43,0.1)" }}
            >
              <Text variant="body" weight="semi" tone={lang === "hi" ? "primary" : "secondary"}>
                {t("lang.hindi") || "हिन्दी"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <IconBadge glyph="↗" bg={colors.primaryFaint} color={colors.primary} size={44} />
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="semi">{t("share.card_title")}</Text>
            <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
              {t("share.card_body")}
            </Text>
          </View>
        </View>
        <Button label={t("share.button")} variant="outline" onPress={shareApp} fullWidth style={{ marginTop: space.md }} />
      </Card>

      <Text variant="tiny" tone="muted" align="center">
        {t("profile.support_footer")}
      </Text>
    </Screen>
  );
}

const langStyles = {
  pill: {
    flex: 1,
    paddingVertical: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center" as const
  },
  pillActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint
  }
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text variant="small" tone="secondary" style={{ flex: 1, paddingRight: space.md }}>{label}</Text>
      <Text variant="body" weight="semi" style={{ flex: 1, textAlign: "right" }}>{value}</Text>
    </View>
  );
}
