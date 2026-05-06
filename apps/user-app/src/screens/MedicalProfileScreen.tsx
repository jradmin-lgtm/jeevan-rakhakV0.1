import React, { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, Screen, Text, colors, space } from "@jr/ui";
import { me } from "../api";

export function MedicalProfileScreen({
  initial,
  onBack,
  onUpdated
}: {
  initial: any;
  onBack: () => void;
  onUpdated?: (profile: any) => void;
}) {
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
      Alert.alert("Saved", "Your medical profile has been updated.");
      onBack();
    } catch (e: any) {
      Alert.alert("Could not save", e?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Medical profile" subtitle="Shared with the ambulance crew during dispatch" onBack={onBack} />

      <Card flat>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <IconBadge glyph="◉" bg="rgba(30,94,255,0.10)" color={colors.accent} size={44} />
          <View style={{ flex: 1 }}>
            <Text variant="label" tone="secondary">ACCOUNT</Text>
            <Text variant="body" weight="semi">{profile?.phone ?? "—"}</Text>
          </View>
        </View>
      </Card>

      <Card>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconBadge glyph="✚" bg={colors.primaryFaint} color={colors.primary} size={36} />
            <Text variant="label" tone="secondary">EDIT MEDICAL DETAILS</Text>
          </View>
          <Input label="Full name" value={name} onChangeText={setName} placeholder="As on hospital records" />
          <Input label="Blood group" value={bloodGroup} onChangeText={setBloodGroup} placeholder="e.g. O+" autoCapitalize="characters" />
          <Input
            label="Allergies / chronic conditions"
            value={allergies}
            onChangeText={setAllergies}
            placeholder="Penicillin, asthma, etc."
            multiline
          />
          <Input
            label="Emergency contact"
            value={emergencyContact}
            onChangeText={setEmergencyContact}
            keyboardType="phone-pad"
            placeholder="Family or guardian phone"
          />
          <Button label="Save" onPress={save} loading={busy} fullWidth size="lg" testID="save-profile" />
        </View>
      </Card>

      <Card flat>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <IconBadge glyph="◆" bg="rgba(16,185,129,0.10)" color={colors.success} size={36} />
          <Text variant="small" tone="secondary" style={{ flex: 1 }}>
            This information is only shared with the responding ambulance team.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
