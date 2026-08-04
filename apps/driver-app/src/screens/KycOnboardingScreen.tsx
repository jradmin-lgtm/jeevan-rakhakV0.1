import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AppHeader, Button, Card, Input, Screen, Text, colors, dialog, radius, space } from "@jr/ui";
import { driver as driverApi, hospitals as hospitalsApi, type HospitalOption } from "../api";
import { useT } from "../i18n";
import { LangToggle } from "../components/LangToggle";

type Props = {
  initial: any;
  onSubmitted: (profile: any) => void;
};

// CR6 (2026-08): the 6 uploadable KYC document slots. "employee_id" is only
// mandatory when employmentType === "hospital_employee" — computed at
// render time, not baked in here.
// Ambulance-type labels are plain descriptive names (BLS/ALS/ICU are already
// established English abbreviations used project-wide, incl. in fare-config
// pricing tiers) — left untranslated like other acronym labels in this app
// (e.g. "GPS", "OTP"), only "Other (specify)" routes through t().
const AMBULANCE_TYPE_VALUES = ["BLS", "ALS", "ICU", "NEONATAL", "CARDIAC", "OTHER"] as const;
function ambulanceTypeLabel(value: string, t: (key: string) => string): string {
  switch (value) {
    case "BLS": return "Basic Life Support (BLS)";
    case "ALS": return "Advanced Life Support (ALS)";
    case "ICU": return "ICU Ambulance";
    case "NEONATAL": return "Neonatal Ambulance";
    case "CARDIAC": return "Cardiac Ambulance";
    case "OTHER": return t("kyc.ambulance_type_specify_option");
    default: return value;
  }
}

/**
 * Single-select chip picker. Local to this screen (mirrors the pattern used
 * by TripScreen's paramedic-assessment ChipRow) rather than added to @jr/ui,
 * since KYC's option sets (ambulance type, employment type) are specific to
 * this one form.
 */
function ChipPicker({
  options,
  value,
  onChange
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {options.map((o) => {
        const sel = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: sel ? colors.primary : colors.border,
              backgroundColor: sel ? colors.primary : colors.surface
            }}
          >
            <Text variant="tiny" weight={sel ? "bold" : "regular"} style={{ color: sel ? "#fff" : colors.textPrimary }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type DocState = "empty" | "uploading" | "uploaded" | "error";

/**
 * One mandatory-document row: RC / PUC / Fitness / Insurance / Licence /
 * Employee ID. Camera + Gallery both call the SAME upload path (base64,
 * quality-compressed client-side so the payload stays well under the
 * server's decoded-bytes cap). Re-picking replaces the previous upload.
 */
function DocUploadRow({
  label,
  docType,
  required,
  uploadedAt,
  onUploaded
}: {
  label: string;
  docType: string;
  required: boolean;
  uploadedAt: string | null;
  onUploaded: (docType: string, uploadedAt: string) => void;
}) {
  const { t } = useT();
  const [state, setState] = useState<DocState>(uploadedAt ? "uploaded" : "empty");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setState(uploadedAt ? "uploaded" : "empty");
  }, [uploadedAt]);

  const pick = async (source: "camera" | "gallery") => {
    setErr(null);
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr(t("kyc.permission_denied"));
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: "images", quality: 0.4, base64: true };
      const result = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const asset = result.canceled ? null : result.assets?.[0];
      const base64 = asset?.base64;
      if (!base64) return;
      setState("uploading");
      const contentType = asset.mimeType && asset.mimeType.startsWith("image/") ? asset.mimeType : "image/jpeg";
      const r = await driverApi.uploadKycDocument(docType, contentType, base64);
      onUploaded(docType, r.uploadedAt);
      setState("uploaded");
    } catch (e: any) {
      setState("error");
      setErr(e?.message ?? t("kyc.upload_failed"));
    }
  };

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text variant="label" tone="secondary">{label}</Text>
        {required ? <Text variant="tiny" tone="danger">*</Text> : null}
      </View>
      {state === "uploaded" ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.sm, borderRadius: radius.md, backgroundColor: "#F0FDF4", borderWidth: 1, borderColor: "#BBF7D0" }}>
          <Text variant="small" tone="success">✓ {t("kyc.doc.uploaded")}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable onPress={() => pick("camera")}><Text variant="tiny" tone="primary" weight="semi">{t("kyc.doc.retake")}</Text></Pressable>
            <Pressable onPress={() => pick("gallery")}><Text variant="tiny" tone="primary" weight="semi">{t("kyc.doc.replace")}</Text></Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Pressable
            onPress={() => pick("camera")}
            disabled={state === "uploading"}
            style={{ flex: 1, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center" }}
          >
            {state === "uploading" ? <ActivityIndicator size="small" color={colors.primary} /> : <Text variant="small" weight="semi">{t("kyc.doc.camera")}</Text>}
          </Pressable>
          <Pressable
            onPress={() => pick("gallery")}
            disabled={state === "uploading"}
            style={{ flex: 1, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center" }}
          >
            <Text variant="small" weight="semi">{t("kyc.doc.gallery")}</Text>
          </Pressable>
        </View>
      )}
      {err ? <Text variant="tiny" tone="danger">{err}</Text> : null}
    </View>
  );
}

/**
 * Driver KYC onboarding — collected on first sign-in after name capture.
 * Driver can't accept rides until admin verifies (server returns 403
 * kyc_pending on /accept until kycVerified flips true).
 *
 * CR6 (2026-08) redesign: two sections — Ambulance Details (RC/PUC/Fitness/
 * Insurance photos + Ambulance Type) and Driver Details (Licence photo +
 * Employment Type, with Employee Number/ID-card conditional on Hospital
 * Employee). The existing Hospital section (which hospital's calls this
 * ambulance serves) is unrelated to employment type and stays as-is for
 * both employment types — it drives dispatch/admin assignment, not payroll.
 */
export function KycOnboardingScreen({ initial, onSubmitted }: Props) {
  const { t } = useT();
  const [licenseNumber, setLicenseNumber] = useState<string>(initial?.licenseNumber ?? "");
  const [vehicleNumber, setVehicleNumber] = useState<string>(initial?.vehicleNumber ?? "");
  const initialVehicleType = initial?.vehicleType ?? "BLS";
  const knownType = (AMBULANCE_TYPE_VALUES as readonly string[]).includes(initialVehicleType);
  const [vehicleType, setVehicleType] = useState<string>(knownType ? initialVehicleType : "OTHER");
  const [vehicleTypeOther, setVehicleTypeOther] = useState<string>(knownType ? "" : initialVehicleType);
  const [rcNumber, setRcNumber] = useState<string>(initial?.rcNumber ?? "");
  const [pucNumber, setPucNumber] = useState<string>(initial?.pucNumber ?? "");
  const [fitnessNumber, setFitnessNumber] = useState<string>(initial?.fitnessNumber ?? "");
  const [insuranceNumber, setInsuranceNumber] = useState<string>(initial?.insuranceNumber ?? "");
  const [employmentType, setEmploymentType] = useState<string | null>(initial?.employmentType ?? null);
  const [employeeNumber, setEmployeeNumber] = useState<string>(initial?.employeeNumber ?? "");
  const [hospitalId, setHospitalId] = useState<string>(initial?.hospitalId ?? "");
  const [hospitalName, setHospitalName] = useState<string>(initial?.hospitalName ?? "");
  const [hospitalList, setHospitalList] = useState<HospitalOption[] | null>(null);
  const [docs, setDocs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await hospitalsApi.list();
        if (mounted) setHospitalList(r.hospitals ?? []);
      } catch {
        if (mounted) setHospitalList([]);
      }
    })();
    (async () => {
      try {
        const r = await driverApi.kycDocuments();
        if (mounted) setDocs(r.documents ?? {});
      } catch {
        /* best-effort — doc rows just show as not-yet-uploaded */
      }
    })();
    return () => { mounted = false; };
  }, []);

  const isHospitalEmployee = employmentType === "hospital_employee";
  const requiredDocs = ["rc", "puc", "fitness", "insurance", "licence", ...(isHospitalEmployee ? ["employee_id"] : [])];
  const allDocsUploaded = requiredDocs.every((d) => !!docs[d]);

  const canSubmit =
    licenseNumber.trim().length >= 4 &&
    vehicleNumber.trim().length >= 4 &&
    rcNumber.trim().length >= 4 &&
    pucNumber.trim().length >= 1 &&
    fitnessNumber.trim().length >= 1 &&
    insuranceNumber.trim().length >= 4 &&
    (vehicleType !== "OTHER" || vehicleTypeOther.trim().length >= 2) &&
    !!employmentType &&
    (!isHospitalEmployee || employeeNumber.trim().length >= 1) &&
    hospitalId.trim().length >= 1 &&
    hospitalName.trim().length >= 2 &&
    allDocsUploaded;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await driverApi.submitKyc({
        licenseNumber: licenseNumber.trim(),
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        vehicleType: vehicleType === "OTHER" ? vehicleTypeOther.trim() : vehicleType,
        rcNumber: rcNumber.trim(),
        pucNumber: pucNumber.trim(),
        fitnessNumber: fitnessNumber.trim(),
        insuranceNumber: insuranceNumber.trim(),
        employmentType: employmentType as "hospital_employee" | "private_driver",
        employeeNumber: isHospitalEmployee ? employeeNumber.trim() : undefined,
        hospitalId: hospitalId.trim(),
        hospitalName: hospitalName.trim()
      });
      onSubmitted(r.driver);
      void dialog.alert(t("kyc.success.title"), t("kyc.success.body"));
    } catch (e: any) {
      setErr(e?.message ?? t("kyc.error_generic"));
    } finally {
      setBusy(false);
    }
  };

  const markUploaded = (docType: string, uploadedAt: string) => {
    setDocs((prev) => ({ ...prev, [docType]: uploadedAt }));
  };

  return (
    <Screen>
      <AppHeader
        title={t("kyc.header.title")}
        subtitle={t("kyc.header.subtitle")}
        right={<LangToggle />}
      />

      <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.xl }}>
        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">{t("kyc.section.ambulance_details")}</Text>

            <Input label={t("kyc.field.vehicle_number")} value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="UP32 AB 4587" autoCapitalize="characters" />

            <Input label={t("kyc.field.rc_number")} value={rcNumber} onChangeText={setRcNumber} placeholder={t("kyc.field.rc_number_placeholder")} />
            <DocUploadRow label={t("kyc.doc.rc_photo")} docType="rc" required uploadedAt={docs.rc ?? null} onUploaded={markUploaded} />

            <Input label={t("kyc.field.puc_number")} value={pucNumber} onChangeText={setPucNumber} placeholder={t("kyc.field.puc_number_placeholder")} />
            <DocUploadRow label={t("kyc.doc.puc_photo")} docType="puc" required uploadedAt={docs.puc ?? null} onUploaded={markUploaded} />

            <Input label={t("kyc.field.fitness_number")} value={fitnessNumber} onChangeText={setFitnessNumber} placeholder={t("kyc.field.fitness_number_placeholder")} />
            <DocUploadRow label={t("kyc.doc.fitness_photo")} docType="fitness" required uploadedAt={docs.fitness ?? null} onUploaded={markUploaded} />

            <Input label={t("kyc.field.insurance_number")} value={insuranceNumber} onChangeText={setInsuranceNumber} placeholder={t("kyc.field.insurance_number_placeholder")} />
            <DocUploadRow label={t("kyc.doc.insurance_photo")} docType="insurance" required uploadedAt={docs.insurance ?? null} onUploaded={markUploaded} />

            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="secondary">{t("kyc.ambulance_type_label")}</Text>
              <ChipPicker
                options={AMBULANCE_TYPE_VALUES.map((v) => ({ value: v, label: ambulanceTypeLabel(v, t) }))}
                value={vehicleType}
                onChange={setVehicleType}
              />
              {vehicleType === "OTHER" ? (
                <Input value={vehicleTypeOther} onChangeText={setVehicleTypeOther} placeholder={t("kyc.ambulance_type_specify")} />
              ) : null}
            </View>
          </View>
        </Card>

        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">{t("kyc.section.driver_details")}</Text>

            <Input label={t("kyc.field.license")} value={licenseNumber} onChangeText={setLicenseNumber} placeholder="As printed on DL" autoCapitalize="characters" />
            <DocUploadRow label={t("kyc.doc.licence_photo")} docType="licence" required uploadedAt={docs.licence ?? null} onUploaded={markUploaded} />

            <View style={{ gap: space.xs }}>
              <Text variant="label" tone="secondary">{t("kyc.employment_type_label")}</Text>
              <ChipPicker
                options={[
                  { value: "hospital_employee", label: t("kyc.employment_hospital") },
                  { value: "private_driver", label: t("kyc.employment_private") }
                ]}
                value={employmentType}
                onChange={setEmploymentType}
              />
            </View>

            {isHospitalEmployee ? (
              <>
                <Input label={t("kyc.employee_number_label")} value={employeeNumber} onChangeText={setEmployeeNumber} placeholder={t("kyc.employee_number_placeholder")} />
                <DocUploadRow label={t("kyc.doc.employee_id_photo")} docType="employee_id" required uploadedAt={docs.employee_id ?? null} onUploaded={markUploaded} />
              </>
            ) : null}
          </View>
        </Card>

        <Card>
          <View style={{ gap: space.md }}>
            <Text variant="label" tone="primary">{t("kyc.section.hospital")}</Text>
            <Text variant="tiny" tone="muted">{t("kyc.hospital.pick_help")}</Text>
            {hospitalList === null ? (
              <View style={{ paddingVertical: space.md, alignItems: "center" }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : hospitalList.length === 0 ? (
              <Text variant="small" tone="danger">{t("kyc.hospital.none")}</Text>
            ) : (
              <View style={{ gap: space.sm }}>
                {hospitalList.map((h) => {
                  const selected = hospitalId === h.id;
                  return (
                    <Pressable
                      key={h.id}
                      onPress={() => { setHospitalId(h.id); setHospitalName(h.name); }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: space.sm,
                        padding: space.md,
                        borderRadius: radius.md,
                        borderWidth: selected ? 2 : 1,
                        borderColor: selected ? colors.primary : colors.border,
                        backgroundColor: selected ? "#FFF5F4" : colors.surface
                      }}
                    >
                      <View style={{
                        width: 18, height: 18, borderRadius: 9, borderWidth: 2,
                        borderColor: selected ? colors.primary : colors.border,
                        alignItems: "center", justifyContent: "center"
                      }}>
                        {selected ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" weight="semi">{h.name}</Text>
                        {h.city || h.address ? (
                          <Text variant="tiny" tone="muted">{[h.address, h.city].filter(Boolean).join(", ")}</Text>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
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
        {!canSubmit ? (
          <Text variant="tiny" tone="muted" align="center">
            {t("kyc.submit_incomplete_hint")}
          </Text>
        ) : null}

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
      <AppHeader title={t("kyc_pending.title")} subtitle={t("kyc_pending.subtitle")} right={<LangToggle />} />
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
