import React, { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { AppHeader, Button, Card, Input, Pill, Screen, Text, colors, space } from "@jr/ui";
import { me } from "../api";
import { useT, setLang, type Lang } from "../i18n";

type Props = {
  initial: any;
  onBack: () => void;
  onUpdated: (profile: any) => void;
};

export function ProfileScreen({ initial, onBack, onUpdated }: Props) {
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
      Alert.alert("Saved", "Your profile has been updated.");
      onBack();
    } catch (e: any) {
      Alert.alert("Could not save", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="My profile" subtitle="Driver account details" onBack={onBack} />

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">EDITABLE</Text>
          <Input label="Full name" value={name} onChangeText={setName} placeholder="As on driving licence" />
          <Button label="Save changes" onPress={save} loading={busy} fullWidth testID="save-profile" />
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">ACCOUNT</Text>
          <Row label="Phone" value={initial?.phone ?? "—"} />
          <Row label="Driver ID" value={initial?.id ? `${initial.id.slice(0, 8)}…` : "—"} />
          <Row label="Rating" value={`⭐ ${(initial?.rating ?? 5).toFixed(1)}`} />
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="label" tone="secondary">VEHICLE & KYC</Text>
            <Pill
              label={initial?.kycVerified ? "VERIFIED" : "PENDING REVIEW"}
              color={initial?.kycVerified ? colors.success : colors.warning}
              bg={initial?.kycVerified ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.15)"}
            />
          </View>
          <Row label="Vehicle number" value={initial?.vehicleNumber ?? "Not on file"} />
          <Row label="Vehicle type" value={initial?.vehicleType ?? "BLS"} />
          <Row label="Licence" value={initial?.licenseNumber ?? "Not on file"} />
          <Text variant="tiny" tone="muted">
            Vehicle and licence updates require admin approval. Contact ops to change these.
          </Text>
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
        Need help? support@jeevanrakshak.app
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
