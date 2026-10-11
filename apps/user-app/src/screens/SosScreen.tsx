import { clicks } from "../clicks";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import * as Location from "expo-location";
import { CircularSos, Button, OutOfServiceArea, MotionView, Screen, Text, colors, space, dialog } from "@jr/ui";
import { Booking, EmergencyType, bookings as bookingsApi, serviceArea as serviceAreaApi } from "../api";
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from "@jr/ui";
import { SosCategoryPicker } from "../components/SosCategoryPicker";
import { useT } from "../i18n";

// v1.3.x (geofence): local haversine for the client-side out-of-area pre-check.
// Kept local (same helper as BookAmbulanceScreen) so the user app needs no
// @jr/utils workspace dependency; the server-side check in POST /bookings is
// the authoritative gate. Returns km between two points.
function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// v1.0.12: removed the Delhi-centroid fallback for SOS. Sending an
// ambulance to the wrong city is worse than refusing to send one — if GPS
// is unavailable we now show an alert pointing the user at the support
// mobile number so they can book over the phone.
async function getPickup(): Promise<{ lat: number; lng: number } | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30_000, requiredAccuracy: 200 });
    const fix = last ?? await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("SOS location timed out")), 12_000); })
    ]);
    if (Date.now() - fix.timestamp > 60_000 || (fix.coords.accuracy ?? Infinity) > 250) throw new Error("SOS location is not accurate enough");
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch (error) { console.warn("[sos] current pickup unavailable", error); return null; }
  finally { if (timeout) clearTimeout(timeout); }
}

export function SosScreen({ onBack, onBooked }: { onBack: () => void; onBooked: (b: Booking) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const dispatching = useRef(false);
  // v1.3.x (geofence): public service-area config. When enabled, we block an
  // SOS whose pickup falls outside radiusKm of the hospital center before
  // hitting the server (the server enforces the same rule as a fallback).
  // Best-effort fetch, keep-last-good — if the config can't be reached we
  // leave it null and let the server be the single gatekeeper.
  const [area, setArea] = useState<{
    enabled: boolean;
    centerLat: number;
    centerLng: number;
    radiusKm: number;
    cityName: string;
    hospitalName: string;
  } | null>(null);
  const [outOfAreaVisible, setOutOfAreaVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  // Pull the public service-area config once on mount. Mounted-guarded so we
  // don't setState after unmount; on failure we keep-last-good (null) and let
  // the server enforce the geofence on POST.
  useEffect(() => {
    let mounted = true;
    serviceAreaApi()
      .then((sa) => {
        if (!mounted) return;
        setArea({
          enabled: sa.enabled,
          centerLat: sa.centerLat,
          centerLng: sa.centerLng,
          radiusKm: sa.radiusKm,
          cityName: sa.cityName,
          hospitalName: sa.hospitalName
        });
      })
      .catch((error) => { console.warn("SosScreen.tsx.SosScreen failed", error instanceof Error ? error.message : String(error)); });
    return () => { mounted = false; };
  }, []);

  // 2026-08-17 bug fix: this used to hardcode emergencyType: "CARDIAC" for
  // every SOS regardless of what was actually happening, and gated dispatch
  // behind a generic dialog.confirm() that claimed "cardiac priority"
  // unconditionally. The category tile tap in SosCategoryPicker IS now the
  // confirmation (net tap count unchanged: tap SOS -> tap a category, same
  // as tap SOS -> tap "Send SOS" before) — dispatch takes the real category.
  const dispatch = async (emergencyType: EmergencyType) => {
    if (dispatching.current) return;
    dispatching.current = true;
    setPickerVisible(false);
    setBusy(true);
    try {
      const pickup = await getPickup();
      if (!pickup) {
        void dialog.show({
          title: t("sos.location_unavailable_title"),
          message: t("sos.location_unavailable_body").replace("{phone}", SUPPORT_PHONE_DISPLAY),
          actions: [
            { label: t("sos.allow_location"), onPress: () => Linking.openSettings().catch(error => { console.error("[sos] settings unavailable", error); void dialog.alert(t("sos.failed_title"), t("common.please_try_again")); }) },
            { label: t("sos.call_number").replace("{phone}", SUPPORT_PHONE_DISPLAY), onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(error => { console.error("[sos] phone action unavailable", error); void dialog.alert(t("sos.failed_title"), SUPPORT_PHONE_DISPLAY); }) },
            { label: t("common.cancel"), style: "cancel" }
          ]
        });
        return;
      }
      // Client-side geofence guard. When the service area is enabled and we
      // have a real pickup fix, block here if the pickup is beyond radiusKm of
      // the hospital center — instant feedback with the 108 fallback instead of
      // a round-trip. The server runs the same check, so this can't be bypassed.
      if (area?.enabled && pickup) {
        const distKm = haversineDistanceKm(
          pickup.lat,
          pickup.lng,
          area.centerLat,
          area.centerLng
        );
        if (distKm > area.radiusKm) {
          setOutOfAreaVisible(true);
          setBusy(false);
          return;
        }
      }
      const r = await bookingsApi.create({
        emergencyType,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: "SOS · current location",
        // v1.0.15: routes the booking through the cascade engine on
        // server-side. Without this the server falls back to the
        // normal broadcast pool and SOS becomes a regular booking.
        isSos: true
      });
      clicks.track("sos.success");
      onBooked(r.booking);
    } catch (e: any) {
      clicks.track("sos.failure");
      // Server-side geofence fallback: the booking handler rejects an
      // out-of-area pickup with error "out_of_service_area". Surface the
      // out-of-area sheet (with the 108 fallback) instead of the generic
      // failure dialog that would otherwise show the raw error code.
      if (e?.message === "out_of_service_area" || e?.details?.error === "out_of_service_area") {
        setOutOfAreaVisible(true);
      } else {
        void dialog.alert(t("sos.failed_title"), e?.message ?? t("common.please_try_again"));
      }
    } finally {
      dispatching.current = false; setBusy(false);
    }
  };

  return (
    <Screen bg={colors.primary} lightStatusBar>
      <Pressable onPress={onBack} disabled={busy} accessibilityRole="button" accessibilityLabel={t("sos.cancel_and_back")}
        style={{ minHeight: 48, alignSelf: "flex-start", paddingHorizontal: 8, justifyContent: "center" }}>
        <Text tone="inverse" style={{ fontSize: 30, lineHeight: 36 }}>‹</Text>
      </Pressable>
      <MotionView style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Text variant="title" weight="bold" tone="inverse" align="center">{t("sos.headline")}</Text>
          <Text tone="inverse" align="center">{t("sos.headline_sub")}</Text>
        </View>
        <CircularSos label={t("sos.button_label")} hint={busy ? t("sos.sending") : t("home.sos.tap")}
          accessibilityLabel={t("sos.button_label")} onPress={() => setPickerVisible(true)} disabled={busy} inverse testID="sos-open-categories" />
        <View style={{ gap: space.md, padding: space.lg, borderRadius: 20, backgroundColor: colors.surface }}>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            <Text weight="bold" style={{ fontSize: 24, lineHeight: 30, color: colors.primary }}>!</Text>
            <Text variant="heading" style={{ flex: 1 }}>{t("sos.info_card_title")}</Text>
          </View>
          <Text tone="secondary">{t("sos.info_card_body")}</Text>
          <Button label={t("sos.cancel_and_back")} variant="outline" onPress={onBack} disabled={busy} />
          <Button label={t("sos.call_number").replace("{phone}", SUPPORT_PHONE_DISPLAY)} variant="ghost" onPress={() => void Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(error => { console.error("[sos] phone action unavailable", error); void dialog.alert(t("sos.failed_title"), SUPPORT_PHONE_DISPLAY); })} />
        </View>
      </MotionView>

      <OutOfServiceArea
        visible={outOfAreaVisible}
        onClose={() => setOutOfAreaVisible(false)}
        cityName={area?.cityName ?? "Bareilly"}
        hospitalName={area?.hospitalName}
        radiusKm={area?.radiusKm}
        emergency={true}
      />

      <SosCategoryPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(type) => { clicks.track("sos.category"); void dispatch(type); }}
      />
    </Screen>
  );
}
