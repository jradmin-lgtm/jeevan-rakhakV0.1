import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { AppHeader, Button, Card, Screen, Text, colors, dialog, radius, space } from "@jr/ui";
import { driver as driverApi } from "../api";
import { useT } from "../i18n";
import { LangToggle } from "../components/LangToggle";

type Props = { onBack: () => void };

type ReissueStatus = "PENDING" | "APPROVED" | "REJECTED";
type ReissueRequest = { id: string; docType: string; status: ReissueStatus; createdAt: string; resolvedAt: string | null };

// 2026-08: licence/aadhar/pan can't be freely self-replaced once uploaded (see
// REISSUE_ELIGIBLE_DOC_TYPES in drivers.ts) — a driver who wants to update one
// after KYC verification raises a tracked request here instead. Same document
// aspect-ratio framing as the onboarding capture (KycOnboardingScreen.tsx).
const DOC_ASPECT: [number, number] = [16, 10];
const REISSUE_DOC_TYPES = ["licence", "aadhar", "pan"] as const;

function docLabel(docType: string, t: (key: string) => string): string {
  switch (docType) {
    case "licence": return t("kyc.doc.licence_photo");
    case "aadhar": return t("kyc.doc.aadhar_photo");
    case "pan": return t("kyc.doc.pan_photo");
    default: return docType;
  }
}

export function DocumentUpdateScreen({ onBack }: Props) {
  const { t, lang } = useT();
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<ReissueRequest[] | null>(null);
  const [busyType, setBusyType] = useState<string | null>(null);
  // 2026-08: identity proof is Aadhar OR PAN (driver's choice at onboarding,
  // see KycOnboardingScreen.tsx) — only show a reissue row for whichever one
  // this driver actually has on file, not both unconditionally.
  const [identityDocType, setIdentityDocType] = useState<"aadhar" | "pan" | null>(null);
  const docTypesToShow: readonly (typeof REISSUE_DOC_TYPES)[number][] = identityDocType
    ? ["licence", identityDocType]
    : ["licence"];

  const refresh = async () => {
    setRefreshing(true);
    setLoadError(false);
    try {
      const [r, documents] = await Promise.all([driverApi.docReissueRequests(), driverApi.kycDocuments()]);
      setRequests(r.requests);
      const docs = documents.documents ?? {};
      setIdentityDocType(docs.pan?.[1] && !docs.aadhar?.[1] ? "pan" : "aadhar");
    } catch (error: any) {
      console.warn("document_update_load_failed", error?.message);
      setLoadError(true);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => { void refresh(); }, []);

  const pendingFor = (docType: string) =>
    (requests ?? []).find((r) => r.docType === docType && r.status === "PENDING");

  const request = async (docType: (typeof REISSUE_DOC_TYPES)[number], source: "camera" | "gallery") => {
    if (busyType || loadError) return;
    setBusyType(docType);
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        void dialog.alert(t("kyc.permission_denied"), "");
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
      const contentType = asset.mimeType && asset.mimeType.startsWith("image/") ? asset.mimeType : "image/jpeg";
      await driverApi.requestDocReissue(docType, contentType, base64);
      await refresh();
      void dialog.alert(t("doc_update.submitted_title"), t("doc_update.submitted_body"));
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("request_already_pending")) {
        void dialog.alert(t("doc_update.already_pending_title"), t("doc_update.already_pending_body"));
      } else {
        void dialog.alert(t("doc_update.error_title"), msg || t("doc_update.error_body"));
      }
    } finally {
      setBusyType(null);
    }
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />} header={<AppHeader title={t("doc_update.header_title")} subtitle={t("doc_update.header_subtitle")} onBack={onBack} right={<LangToggle />} />}>
      <Button label={lang === "hi" ? "स्थिति रीफ़्रेश करें" : "Refresh status"} variant="ghost" onPress={refresh} disabled={refreshing || busyType !== null} />
      {loadError ? <Card>
        <Text variant="small" tone="danger">{lang === "hi" ? "दस्तावेज़ की स्थिति लोड नहीं हुई।" : "Could not load document status."}</Text>
        <Button label={lang === "hi" ? "फिर कोशिश करें" : "Retry"} onPress={refresh} variant="outline" />
      </Card> : null}

      {requests === null && !loadError ? (
        <View style={{ paddingVertical: space.lg, alignItems: "center" }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        requests === null ? null : docTypesToShow.map((docType) => {
          const pending = pendingFor(docType);
          const latest = pending ?? (requests ?? []).filter(r => r.docType === docType).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
          const busy = busyType === docType;
          return (
            <Card key={docType}>
              <View style={{ gap: space.sm }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text variant="label" tone="secondary">{docLabel(docType, t)}</Text>
                  {latest ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: latest.status === "APPROVED" ? "#DCFCE7" : latest.status === "REJECTED" ? "#FEE2E2" : "#FEF3C7" }}>
                      <Text variant="tiny" weight="semi" style={{ color: latest.status === "APPROVED" ? "#166534" : latest.status === "REJECTED" ? "#991B1B" : "#92400E" }}>{t(`doc_update.status_${latest.status.toLowerCase()}`)}</Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="tiny" tone="muted">{t("doc_update.explainer")}</Text>
                {latest && latest.status !== "PENDING" ? <Text variant="small" tone={latest.status === "REJECTED" ? "danger" : "secondary"}>{t(`doc_update.review_${latest.status.toLowerCase()}`)}</Text> : null}
                {pending ? (
                  <Text variant="tiny" tone="muted">{t("doc_update.pending_since")}</Text>
                ) : (
                  <View style={{ flexDirection: "row", gap: space.sm }}>
                    <Pressable
                      onPress={() => request(docType, "camera")}
                      accessibilityRole="button" disabled={busyType !== null || loadError}
                      style={{ minHeight: 44, justifyContent: "center", flex: 1, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center" }}
                    >
                      {busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Text variant="small" weight="semi">{t("kyc.doc.camera")}</Text>}
                    </Pressable>
                    <Pressable
                      onPress={() => request(docType, "gallery")}
                      accessibilityRole="button" disabled={busyType !== null || loadError}
                      style={{ minHeight: 44, justifyContent: "center", flex: 1, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center" }}
                    >
                      <Text variant="small" weight="semi">{t("kyc.doc.gallery")}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </Card>
          );
        })
      )}

      <Text variant="tiny" tone="muted" align="center">
        {t("doc_update.footer")}
      </Text>
    </Screen>
  );
}
