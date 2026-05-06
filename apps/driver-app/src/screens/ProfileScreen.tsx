import React, { useState } from "react";
import { Alert, View } from "react-native";
import { AppHeader, Button, Card, Input, Pill, Screen, Text, colors, space } from "@jr/ui";
import { me } from "../api";

type Props = {
  initial: any;
  onBack: () => void;
  onUpdated: (profile: any) => void;
};

export function ProfileScreen({ initial, onBack, onUpdated }: Props) {
  const [name, setName] = useState<string>(initial?.name ?? "");
  const [busy, setBusy] = useState(false);

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

      <Text variant="tiny" tone="muted" align="center">
        Need help? support@jeevanrakshak.app
      </Text>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text variant="small" tone="secondary">{label}</Text>
      <Text variant="body" weight="semi">{value}</Text>
    </View>
  );
}
