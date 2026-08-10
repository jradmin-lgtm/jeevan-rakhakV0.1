import React, { useEffect, useRef, useState } from "react";
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

// 2026-08: capture at a fixed document aspect ratio (ID/RC-card-ish 1.6:1,
// wider than a phone screen's native photo) rather than whatever ratio the
// camera defaults to, matching the frame-guide pattern used by ID-scan apps.
// expo-image-picker's `aspect` only constrains the built-in crop step, which
// is enough of a "framed for clicking" guide without a custom camera view.
const DOC_ASPECT: [number, number] = [16, 10];

/**
 * One document-photo capture row for a single page. Camera + Gallery both
 * call the SAME upload path (base64, quality-compressed + cropped to a fixed
 * document ratio client-side). Re-picking replaces the previous upload for
 * THIS page only — other pages of the same doc type are untouched.
 */
function DocUploadRow({
  label,
  docType,
  page = 1,
  required,
  uploadedAt,
  onUploaded,
  onRemove
}: {
  label: string;
  docType: string;
  page?: number;
  required: boolean;
  uploadedAt: string | null;
  onUploaded: (docType: string, page: number, uploadedAt: string) => void;
  onRemove?: () => void;
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
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: "images",
        quality: 0.4,
        base64: true,
        allowsEditing: true,
        aspect: DOC_ASPECT
      };
      const result = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const asset = result.canceled ? null : result.assets?.[0];
      const base64 = asset?.base64;
      if (!base64) return;
      setState("uploading");
      const contentType = asset.mimeType && asset.mimeType.startsWith("image/") ? asset.mimeType : "image/jpeg";
      const r = await driverApi.uploadKycDocument(docType, contentType, base64, page);
      onUploaded(docType, page, r.uploadedAt);
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
        {onRemove && state === "empty" ? (
          <Pressable onPress={onRemove} style={{ marginLeft: "auto" }}>
            <Text variant="tiny" tone="muted">{t("kyc.doc.remove_page")}</Text>
          </Pressable>
        ) : null}
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

const MAX_DOC_PAGES = 3;

/**
 * Wraps DocUploadRow to add up to MAX_DOC_PAGES pages per doc type ("+ Add
 * page" for multi-page documents like Aadhar front/back). Only page 1 can be
 * `required` — pages 2/3 are always optional extras. An empty trailing page
 * can be removed; a page with data cannot (re-upload/replace it instead).
 */
function MultiPageDocGroup({
  label,
  docType,
  required,
  pages,
  onUploaded
}: {
  label: string;
  docType: string;
  required: boolean;
  pages: Record<number, string>;
  onUploaded: (docType: string, page: number, uploadedAt: string) => void;
}) {
  const { t } = useT();
  const uploadedPageNumbers = Object.keys(pages).map(Number);
  const highestUploaded = uploadedPageNumbers.length ? Math.max(...uploadedPageNumbers) : 0;
  // Local-only "extra empty slot" count — lets the driver add a page before
  // uploading into it. Resets to just the uploaded pages on remount, which is
  // fine: an unfilled slot never persisted anything server-side anyway.
  const [extraSlots, setExtraSlots] = useState(0);
  const visibleCount = Math.max(1, highestUploaded, Math.min(highestUploaded + extraSlots, MAX_DOC_PAGES));

  return (
    <View style={{ gap: space.sm }}>
      {Array.from({ length: visibleCount }, (_, i) => i + 1).map((page) => (
        <DocUploadRow
          key={page}
          label={page === 1 ? label : `${label} · ${t("kyc.doc.page_n").replace("{n}", String(page))}`}
          docType={docType}
          page={page}
          required={required && page === 1}
          uploadedAt={pages[page] ?? null}
          onUploaded={onUploaded}
          onRemove={page > 1 && page > highestUploaded ? () => setExtraSlots((n) => Math.max(0, n - 1)) : undefined}
        />
      ))}
      {visibleCount < MAX_DOC_PAGES ? (
        <Pressable onPress={() => setExtraSlots((n) => n + 1)}>
          <Text variant="tiny" tone="primary" weight="semi">+ {t("kyc.doc.add_page")}</Text>
        </Pressable>
      ) : null}
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
  const [docs, setDocs] = useState<Record<string, Record<number, string>>>({});
  // 2026-08: which identity doc the picker shows. Defaults to "aadhar";
  // flipped to "pan" once the async doc fetch below reveals a driver already
  // has a PAN on file but no Aadhar (e.g. re-opening onboarding after a
  // partial fill). A manual pick afterward always wins — see the effect below.
  const [identityDocType, setIdentityDocType] = useState<"aadhar" | "pan">("aadhar");
  const identityDocDefaulted = useRef(false);
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
        if (!mounted) return;
        const fetched = r.documents ?? {};
        setDocs(fetched);
        if (!identityDocDefaulted.current) {
          identityDocDefaulted.current = true;
          if (fetched.pan?.[1] && !fetched.aadhar?.[1]) setIdentityDocType("pan");
        }
      } catch {
        /* best-effort — doc rows just show as not-yet-uploaded */
      }
    })();
    return () => { mounted = false; };
  }, []);

  const isHospitalEmployee = employmentType === "hospital_employee";
  // 2026-08: licence is mandatory; identity proof is Aadhar OR PAN (driver's
  // choice, not both). A PAN card isn't universal (it's a tax ID, not every
  // driver has one) — requiring both would permanently block onboarding for
  // anyone without one. RC, PUC, fitness, insurance, and employee ID remain
  // uploadable but optional, driven by real onboarding friction on launch day.
  const hasIdentityProof = !!docs.aadhar?.[1] || !!docs.pan?.[1];
  const allMandatoryDocsUploaded = !!docs.licence?.[1] && hasIdentityProof;

  const canSubmit =
    licenseNumber.trim().length >= 4 &&
    vehicleNumber.trim().length >= 4 &&
    (vehicleType !== "OTHER" || vehicleTypeOther.trim().length >= 2) &&
    !!employmentType &&
    hospitalId.trim().length >= 1 &&
    hospitalName.trim().length >= 2 &&
    allMandatoryDocsUploaded;

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

  const markUploaded = (docType: string, page: number, uploadedAt: string) => {
    setDocs((prev) => ({ ...prev, [docType]: { ...(prev[docType] ?? {}), [page]: uploadedAt } }));
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
            <MultiPageDocGroup label={t("kyc.doc.rc_photo")} docType="rc" required={false} pages={docs.rc ?? {}} onUploaded={markUploaded} />

            <Input label={t("kyc.field.puc_number")} value={pucNumber} onChangeText={setPucNumber} placeholder={t("kyc.field.puc_number_placeholder")} />
            <MultiPageDocGroup label={t("kyc.doc.puc_photo")} docType="puc" required={false} pages={docs.puc ?? {}} onUploaded={markUploaded} />

            <Input label={t("kyc.field.fitness_number")} value={fitnessNumber} onChangeText={setFitnessNumber} placeholder={t("kyc.field.fitness_number_placeholder")} />
            <MultiPageDocGroup label={t("kyc.doc.fitness_photo")} docType="fitness" required={false} pages={docs.fitness ?? {}} onUploaded={markUploaded} />

            <Input label={t("kyc.field.insurance_number")} value={insuranceNumber} onChangeText={setInsuranceNumber} placeholder={t("kyc.field.insurance_number_placeholder")} />
            <MultiPageDocGroup label={t("kyc.doc.insurance_photo")} docType="insurance" required={false} pages={docs.insurance ?? {}} onUploaded={markUploaded} />

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
            <MultiPageDocGroup label={t("kyc.doc.licence_photo")} docType="licence" required pages={docs.licence ?? {}} onUploaded={markUploaded} />

            <View style={{ gap: space.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text variant="label" tone="secondary">{t("kyc.identity_proof_label")}</Text>
                <Text variant="tiny" tone="danger">*</Text>
              </View>
              <Text variant="tiny" tone="muted">{t("kyc.identity_proof_hint")}</Text>
              <ChipPicker
                options={[
                  { value: "aadhar", label: t("kyc.identity_proof.aadhar") },
                  { value: "pan", label: t("kyc.identity_proof.pan") }
                ]}
                value={identityDocType}
                onChange={(v) => setIdentityDocType(v as "aadhar" | "pan")}
              />
            </View>
            <MultiPageDocGroup
              label={identityDocType === "aadhar" ? t("kyc.doc.aadhar_photo") : t("kyc.doc.pan_photo")}
              docType={identityDocType}
              required
              pages={docs[identityDocType] ?? {}}
              onUploaded={markUploaded}
            />

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
                <MultiPageDocGroup label={t("kyc.doc.employee_id_photo")} docType="employee_id" required={false} pages={docs.employee_id ?? {}} onUploaded={markUploaded} />
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
