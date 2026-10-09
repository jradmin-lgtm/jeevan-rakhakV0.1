import React, { useEffect, useRef, useState } from "react";
import { Share, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, Screen, Text, colors, space, dialog } from "@jr/ui";
import { me } from "../api";
import { useT } from "../i18n";

// The download link goes through the admin-web /qr redirector (not
// /download-apk directly) so it can be repointed later (a custom domain, a
// Play Store listing, etc.) without this already-shipped share text ever
// going stale.
const SHARE_LINK = "https://jr-admin.vercel.app/qr";

export function MedicalProfileScreen({
  initial,
  onBack,
  onUpdated
}: {
  initial: any;
  onBack: () => void;
  onUpdated?: (profile: any) => void;
}) {
  const { t, lang } = useT();
  const dirty = useRef(false);
  const [loadError, setLoadError] = useState(false);
  const [profile, setProfile] = useState<any>(initial);
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [bloodGroup, setBloodGroup] = useState<string>(initial?.bloodGroup ?? "");
  const [allergies, setAllergies] = useState<string>(initial?.allergies ?? "");
  const [emergencyContact, setEmergencyContact] = useState<string>(initial?.emergencyContact ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    me.get()
      .then((r) => {
        if (!active || dirty.current) return;
        setProfile(r.profile);
        setName(r.profile.name ?? "");
        setBloodGroup(r.profile.bloodGroup ?? "");
        setAllergies(r.profile.allergies ?? "");
        setEmergencyContact(r.profile.emergencyContact ?? "");
      })
      .catch(error => { console.warn("medical_profile_load_failed", error?.message); if (active) setLoadError(true); });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const r = await me.update({ name: name.trim(), bloodGroup: bloodGroup.trim(), allergies: allergies.trim(), emergencyContact: emergencyContact.trim() });
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

  const shareApp = async () => {
    try {
      await Share.share({ message: t("share.message").replace("{link}", SHARE_LINK) });
    } catch (error: any) {
      console.warn("profile_share_failed", error?.message);
      void dialog.alert(lang === "hi" ? "शेयर नहीं हुआ" : "Could not share", t("common.try_again_short"));
    }
  };

  return (
    <Screen
      header={<AppHeader title={t("home.medical_profile")} subtitle={t("medical.subtitle")} onBack={onBack} />}
      footer={<Button label={t("common.save")} onPress={save} loading={busy} disabled={busy || !name.trim()} fullWidth size="lg" testID="save-profile" />}
    >
      {loadError ? <Text variant="small" tone="secondary">{lang === "hi" ? "नवीनतम जानकारी लोड नहीं हुई। सहेजने से पहले विवरण जाँचें।" : "Could not refresh your profile. Check the details before saving."}</Text> : null}

      <Card flat>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <IconBadge glyph="◉" bg="rgba(30,94,255,0.10)" color={colors.accent} size={44} />
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="secondary">{t("medical.account_label")}</Text>
            <Text variant="body" weight="semi">{profile?.phone ?? "·"}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconBadge glyph="✚" bg={colors.primaryFaint} color={colors.primary} size={36} />
            <Text variant="label" tone="secondary">{t("medical.edit_details_label")}</Text>
          </View>
          <Input label={t("profile_setup.name_label")} value={name} onChangeText={value => { dirty.current = true; setName(value); }} placeholder={t("medical.name_placeholder")} />
          <Input label={t("medical.blood_group_label")} value={bloodGroup} onChangeText={value => { dirty.current = true; setBloodGroup(value); }} placeholder={t("medical.blood_group_placeholder")} autoCapitalize="characters" />
          <Input
            label={t("medical.allergies_label")}
            value={allergies}
            onChangeText={value => { dirty.current = true; setAllergies(value); }}
            placeholder={t("medical.allergies_placeholder")}
            multiline
          />
          <Input
            label={t("medical.emergency_contact_label")}
            value={emergencyContact}
            onChangeText={value => { dirty.current = true; setEmergencyContact(value); }}
            keyboardType="phone-pad"
            placeholder={t("medical.emergency_contact_placeholder")}
          />
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
