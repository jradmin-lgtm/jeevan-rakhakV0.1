import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, Screen, Text, colors, space, dialog } from "@jr/ui";
import { me } from "../api";
import { useT } from "../i18n";

export function MedicalProfileScreen({
  initial,
  onBack,
  onUpdated
}: {
  initial: any;
  onBack: () => void;
  onUpdated?: (profile: any) => void;
}) {
  const { t } = useT();
  const [profile, setProfile] = useState<any>(initial);
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [bloodGroup, setBloodGroup] = useState<string>(initial?.bloodGroup ?? "");
  const [allergies, setAllergies] = useState<string>(initial?.allergies ?? "");
  const [emergencyContact, setEmergencyContact] = useState<string>(initial?.emergencyContact ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    me.get()
      .then((r) => {
        setProfile(r.profile);
        setName(r.profile.name ?? "");
        setBloodGroup(r.profile.bloodGroup ?? "");
        setAllergies(r.profile.allergies ?? "");
        setEmergencyContact(r.profile.emergencyContact ?? "");
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const r = await me.update({ name, bloodGroup, allergies, emergencyContact });
      setProfile(r.profile);
      onUpdated?.(r.profile);
      void dialog.alert(t("common.saved_title"), t("medical.saved_body"));
      onBack();
    } catch (e: any) {
      void dialog.alert(t("medical.save_error_title"), e?.message ?? t("common.try_again_short"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title={t("home.medical_profile")} subtitle={t("medical.subtitle")} onBack={onBack} />

      <Card flat>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <IconBadge glyph="◉" bg="rgba(30,94,255,0.10)" color={colors.accent} size={44} />
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="secondary">{t("medical.account_label")}</Text>
            <Text variant="body" weight="semi">{profile?.phone ?? "-"}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconBadge glyph="✚" bg={colors.primaryFaint} color={colors.primary} size={36} />
            <Text variant="label" tone="secondary">{t("medical.edit_details_label")}</Text>
          </View>
          <Input label={t("profile_setup.name_label")} value={name} onChangeText={setName} placeholder={t("medical.name_placeholder")} />
          <Input label={t("medical.blood_group_label")} value={bloodGroup} onChangeText={setBloodGroup} placeholder={t("medical.blood_group_placeholder")} autoCapitalize="characters" />
          <Input
            label={t("medical.allergies_label")}
            value={allergies}
            onChangeText={setAllergies}
            placeholder={t("medical.allergies_placeholder")}
            multiline
          />
          <Input
            label={t("medical.emergency_contact_label")}
            value={emergencyContact}
            onChangeText={setEmergencyContact}
            keyboardType="phone-pad"
            placeholder={t("medical.emergency_contact_placeholder")}
          />
          <Button label={t("common.save")} onPress={save} loading={busy} fullWidth size="lg" testID="save-profile" />
        </View>
      </Card>

      <Card flat>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <IconBadge glyph="◆" bg="rgba(16,185,129,0.10)" color={colors.success} size={36} />
          <Text variant="small" tone="secondary" style={{ flex: 1 }}>
            {t("medical.privacy_note")}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
