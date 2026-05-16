import React, { useState } from "react";
import { View } from "react-native";
import { AppHeader, Button, Card, IconBadge, Input, Screen, Text, colors, space } from "@jr/ui";
import { me } from "../api";

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
  const [name, setName] = useState(initialName ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErr("Please enter your full name so the driver can identify you.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await me.update({ name: trimmed });
      onSaved(r.profile);
    } catch (e: any) {
      setErr(e?.message ?? "Could not save your name. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="What should we call you?" subtitle="So the driver can address you on arrival" />
      <View style={{ alignItems: "center", paddingVertical: space.md }}>
        <IconBadge glyph="JR" size={72} bg={colors.primaryFaint} color={colors.primary} />
      </View>

      <Card>
        <View style={{ gap: space.md }}>
          <Input
            label="Your name"
            placeholder="Ravi Kumar"
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="words"
            error={err ?? undefined}
            testID="name-input"
          />
          <Button
            label="Continue"
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
        Your name is shared only with the assigned driver and our operations team.
      </Text>
    </Screen>
  );
}
