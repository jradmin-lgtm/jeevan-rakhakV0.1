import React, { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { AppHeader, Button, Card, Input, Screen, Text, colors, space } from "@jr/ui";
import { driver as driverApi } from "../api";
import { useT } from "../i18n";

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
  const { t, lang, setLang } = useT();
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
      Alert.alert(t("kyc.success.title"), t("kyc.success.body"));
    } catch (e: any) {
      setErr(e?.message ?? "Could not submit. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppHeader
        title={t("kyc.header.title")}
        subtitle={t("kyc.header.subtitle")}
        right={
          <Pressable
            onPress={() => void setLang(lang === "en" ? "hi" : "en")}
            accessibilityLabel="Switch language"
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "rgba(30,94,255,0.10)", borderRadius: 999 }}
          >
            <Text variant="small" weight="bold" style={{ color: lang === "en" ? colors.accent : "#94A3B8" }}>EN</Text>
            <Text variant="small" tone="muted">|</Text>
            <Text variant="small" weight="bold" style={{ color: lang === "hi" ? colors.accent : "#94A3B8" }}>हि</Text>
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}>
        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">{t("kyc.section.vehicle")}</Text>
            <Input
              label={t("kyc.field.vehicle_number")}
              value={vehicleNumber}
              onChangeText={setVehicleNumber}
              placeholder="UP32 AB 4587"
              autoCapitalize="characters"
            />
            <Input
              label={t("kyc.field.vehicle_type")}
              value={vehicleType}
              onChangeText={setVehicleType}
              placeholder="BLS / ALS / ICU"
              autoCapitalize="characters"
            />
            <Input
              label={t("kyc.field.rc")}
              value={rcNumber}
              onChangeText={setRcNumber}
              placeholder="As printed on RC"
            />
            <Input
              label={t("kyc.field.insurance")}
              value={insuranceNumber}
              onChangeText={setInsuranceNumber}
              placeholder="Active policy number"
            />
          </View>
        </Card>

        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">{t("kyc.section.driver")}</Text>
            <Input
              label={t("kyc.field.license")}
              value={licenseNumber}
              onChangeText={setLicenseNumber}
              placeholder="As printed on DL"
              autoCapitalize="characters"
            />
            <Text variant="tiny" tone="muted">{t("kyc.note.photos")}</Text>
          </View>
        </Card>

        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">{t("kyc.section.hospital")}</Text>
            <Input
              label={t("kyc.field.hospital_name")}
              value={hospitalName}
              onChangeText={setHospitalName}
              placeholder="e.g., Apollo Indraprastha"
            />
            <Input
              label={t("kyc.field.hospital_id")}
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
          label={busy ? t("kyc.submit.busy") : t("kyc.submit")}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
          fullWidth
          size="lg"
        />

        <Text variant="tiny" tone="muted" align="center">
          {t("kyc.footer")}
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
  const { t } = useT();
  React.useEffect(() => {
    const id = setInterval(onProfileRefresh, 15000);
    return () => clearInterval(id);
  }, [onProfileRefresh]);

  return (
    <Screen>
      <AppHeader title={t("kyc_pending.title")} subtitle={t("kyc_pending.subtitle")} />
      <Card>
        <View style={{ gap: space.md, alignItems: "center", paddingVertical: space.lg }}>
          <Text variant="title" align="center">⏳</Text>
          <Text variant="heading" weight="bold" align="center">
            {t("kyc_pending.heading")}
          </Text>
          <Text variant="body" tone="secondary" align="center">
            {t("kyc_pending.body")}
          </Text>
          <Text variant="small" tone="muted" align="center">
            {t("kyc_pending.auto_route")}
          </Text>
        </View>
      </Card>

      <Button label={t("kyc_pending.refresh")} variant="outline" onPress={onProfileRefresh} fullWidth />
    </Screen>
  );
}
