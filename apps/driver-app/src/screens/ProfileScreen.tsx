import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { AppHeader, Button, Card, Input, Pill, Screen, Text, colors, dialog, space } from "@jr/ui";
import { me } from "../api";
import { useT, setLang, type Lang } from "../i18n";
import { LangToggle } from "../components/LangToggle";

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

  const save = async () => {
    setBusy(true);
    try {
      const r = await me.update({ name });
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
    <Screen>
      <AppHeader title={t("profile.header_title")} subtitle={t("profile.header_subtitle")} onBack={onBack} right={<LangToggle />} />

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("profile.section_editable")}</Text>
          <Input label={t("profile_setup.name_label")} value={name} onChangeText={setName} placeholder={t("profile.name_placeholder_hint")} />
          <Button label={t("profile.save_changes")} onPress={save} loading={busy} fullWidth testID="save-profile" />
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("profile.section_account")}</Text>
          <Row label={t("profile.row_phone")} value={initial?.phone ?? "-"} />
          <Row label={t("profile.row_driver_id")} value={initial?.id ? `${initial.id.slice(0, 8)}…` : "-"} />
          <Row label={t("profile.row_rating")} value={`⭐ ${(initial?.rating ?? 5).toFixed(1)}`} />
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
          <Row label={t("kyc.field.vehicle_type")} value={initial?.vehicleType ?? "BLS"} />
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
          <Text variant="label" tone="secondary">LANGUAGE</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable
              onPress={() => switchLang("en")}
              style={[langStyles.pill, lang === "en" && langStyles.pillActive]}
              android_ripple={{ color: "rgba(229,50,43,0.1)" }}
            >
              <Text variant="body" weight="semi" tone={lang === "en" ? "primary" : "secondary"}>
                {t("lang.english") || "English"}
              </Text>
            </Pressable>
            <Pressable
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
      <Text variant="small" tone="secondary">{label}</Text>
      <Text variant="body" weight="semi">{value}</Text>
    </View>
  );
}
