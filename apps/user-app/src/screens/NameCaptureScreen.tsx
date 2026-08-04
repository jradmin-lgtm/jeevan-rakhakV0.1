import React, { useState } from "react";
import { View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, Screen, Text, colors, space } from "@jr/ui";
import { me } from "../api";
import { useT } from "../i18n";

type Props = {
  initialName?: string | null;
  onSaved: (profile: any) => void;
};

/**
 * Mandatory name capture. Mounted immediately after a successful OTP verify
 * when the user's profile has no name yet. The user cannot move past this
 * screen until they save — it's the first thing the home banner reads.
 */
export function NameCaptureScreen({ initialName, onSaved }: Props) {
  const { t } = useT();
  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErr(t("name_capture.error_too_short"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await me.update({ name: trimmed });
      onSaved(r.profile);
    } catch (e: any) {
      setErr(e?.message ?? t("name_capture.error_generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title={t("name_capture.title")} subtitle={t("name_capture.subtitle")} />
      <View style={{ alignItems: "center", paddingVertical: space.md }}>
        <IconBadge glyph="JR" size={72} bg={colors.primaryFaint} color={colors.primary} />
      </View>

      <Card>
        <View style={{ gap: space.md }}>
          <Input
            label={t("name_capture.name_label")}
            placeholder={t("profile_setup.name_placeholder")}
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="words"
            error={err ?? undefined}
            testID="name-input"
          />
          <Button
            label={t("common.continue")}
            onPress={save}
            loading={busy}
            disabled={name.trim().length < 2}
            fullWidth
            size="lg"
            testID="name-save"
          />
        </View>
      </Card>

      <Text variant="tiny" tone="muted" align="center">
        {t("name_capture.privacy_note")}
      </Text>
    </Screen>
  );
}
