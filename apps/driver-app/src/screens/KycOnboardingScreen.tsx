import React, { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { AppHeader, Button, Card, Input, Screen, Text, colors, space } from "@jr/ui";
import { driver as driverApi } from "../api";

type Props = {
  initial: any;
  onSubmitted: (profile: any) => void;
};

/**
 * Driver KYC onboarding — collected on first sign-in after name capture.
 * Driver can't accept rides until admin verifies (server returns 403
 * kyc_pending on /accept until kycVerified flips true). For v1.0.11 we
 * collect text-only fields; actual document photos land in v1.0.12 when
 * blob storage is provisioned. The page renders again later from the
 * profile screen if the driver wants to update any field.
 *
 * Required fields are gated client-side (Submit button disabled). Server
 * also accepts the partial PATCH, but the team wants a complete profile
 * before reviewing.
 */
export function KycOnboardingScreen({ initial, onSubmitted }: Props) {
  const [licenseNumber, setLicenseNumber] = useState<string>(initial?.licenseNumber ?? "");
  const [vehicleNumber, setVehicleNumber] = useState<string>(initial?.vehicleNumber ?? "");
  const [vehicleType, setVehicleType] = useState<string>(initial?.vehicleType ?? "BLS");
  const [rcNumber, setRcNumber] = useState<string>(initial?.rcNumber ?? "");
  const [insuranceNumber, setInsuranceNumber] = useState<string>(initial?.insuranceNumber ?? "");
  const [hospitalId, setHospitalId] = useState<string>(initial?.hospitalId ?? "");
  const [hospitalName, setHospitalName] = useState<string>(initial?.hospitalName ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSubmit =
    licenseNumber.trim().length >= 4 &&
    vehicleNumber.trim().length >= 4 &&
    rcNumber.trim().length >= 4 &&
    insuranceNumber.trim().length >= 4 &&
    hospitalId.trim().length >= 1 &&
    hospitalName.trim().length >= 2;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await driverApi.submitKyc({
        licenseNumber: licenseNumber.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        vehicleType: vehicleType.trim() || "BLS",
        rcNumber: rcNumber.trim(),
        insuranceNumber: insuranceNumber.trim(),
        hospitalId: hospitalId.trim(),
        hospitalName: hospitalName.trim()
      });
      onSubmitted(r.driver);
      Alert.alert(
        "Profile submitted",
        "Our team will verify your details. You'll start receiving requests once approved — usually within a few hours during pilot."
      );
    } catch (e: any) {
      setErr(e?.message ?? "Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Driver profile" subtitle="Submit your details for verification" />

      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}>
        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">VEHICLE</Text>
            <Input
              label="Ambulance vehicle number"
              value={vehicleNumber}
              onChangeText={setVehicleNumber}
              placeholder="UP32 AB 4587"
              autoCapitalize="characters"
            />
            <Input
              label="Vehicle type"
              value={vehicleType}
              onChangeText={setVehicleType}
              placeholder="BLS / ALS / ICU"
              autoCapitalize="characters"
            />
            <Input
              label="RC number (Vehicle registration certificate)"
              value={rcNumber}
              onChangeText={setRcNumber}
              placeholder="As printed on RC"
            />
            <Input
              label="Insurance policy number"
              value={insuranceNumber}
              onChangeText={setInsuranceNumber}
              placeholder="Active policy number"
            />
          </View>
        </Card>

        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">DRIVER &amp; LICENCE</Text>
            <Input
              label="Driving licence number"
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="As printed on DL"
              autoCapitalize="characters"
            />
            <Text variant="tiny" tone="muted">
              Document photo upload arrives in v1.0.12. For now, our ops team will verify your details against physical copies during onboarding.
            </Text>
          </View>
        </Card>

        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">HOSPITAL / ORGANISATION</Text>
            <Input
              label="Hospital / organisation name"
              value={hospitalName}
              onChangeText={setHospitalName}
              placeholder="e.g., Apollo Indraprastha"
            />
            <Input
              label="Your hospital employee ID"
              value={hospitalId}
              onChangeText={setHospitalId}
              placeholder="Employee ID / staff number"
            />
          </View>
        </Card>

        {err ? (
          <Card flat>
            <Text variant="small" tone="danger">{err}</Text>
          </Card>
        ) : null}

        <Button
          label={busy ? "Submitting…" : "Submit for verification"}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
          fullWidth
          size="lg"
        />

        <Text variant="tiny" tone="muted" align="center">
          Once verified, you'll receive ambulance requests automatically.{"\n"}
          Verification usually takes a few hours.
        </Text>
      </ScrollView>
    </Screen>
  );
}

/**
 * Holding screen for drivers who've submitted KYC but haven't been verified.
 * Renders instead of the Dashboard. Auto-refreshes the profile every 15s so
 * the moment admin verifies, the driver lands on the dashboard automatically.
 */
export function KycPendingScreen({ onProfileRefresh }: { onProfileRefresh: () => void }) {
  React.useEffect(() => {
    const id = setInterval(onProfileRefresh, 15000);
    return () => clearInterval(id);
  }, [onProfileRefresh]);

  return (
    <Screen>
      <AppHeader title="Profile under review" subtitle="You'll start receiving requests once approved" />
      <Card>
        <View style={{ gap: space.md, alignItems: "center", paddingVertical: space.lg }}>
          <Text variant="title" align="center">⏳</Text>
          <Text variant="heading" weight="bold" align="center">
            Verification in progress
          </Text>
          <Text variant="body" tone="secondary" align="center">
            Our team is reviewing your documents and vehicle details. This usually takes a few hours during pilot.
          </Text>
          <Text variant="small" tone="muted" align="center">
            We'll move you to the dashboard automatically the moment you're approved.
          </Text>
        </View>
      </Card>

      <Button label="Refresh status" variant="outline" onPress={onProfileRefresh} fullWidth />
    </Screen>
  );
}
