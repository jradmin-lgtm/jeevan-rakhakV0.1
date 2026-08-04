import React, { useEffect, useRef, useState } from "react";
import { Animated, Linking, Pressable, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { AppHeader, Button, Card, IconBadge, OutOfServiceArea, PulseDot, Screen, Text, colors, space, dialog } from "@jr/ui";
import { Booking, bookings as bookingsApi, serviceArea as serviceAreaApi } from "../api";
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from "@jr/ui";
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
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    } catch {
      /* ignored */
    }
    return null;
  }
}

export function SosScreen({ onBack, onBooked }: { onBack: () => void; onBooked: (b: Booking) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const breathe = useRef(new Animated.Value(1)).current;
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
      .catch(() => {
        /* keep-last-good — server still gatekeeps on POST */
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 900, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const dispatch = async () => {
    if (
      !(await dialog.confirm({
        title: t("sos.confirm_title"),
        message: t("sos.confirm_message"),
        confirmText: t("sos.confirm_button"),
        cancelText: t("common.cancel"),
        destructive: true
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      const pickup = await getPickup();
      if (!pickup) {
        void dialog.show({
          title: t("sos.location_unavailable_title"),
          message: t("sos.location_unavailable_body").replace("{phone}", SUPPORT_PHONE_DISPLAY),
          actions: [
            { label: t("sos.allow_location"), onPress: () => Linking.openSettings().catch(() => {}) },
            { label: t("sos.call_number").replace("{phone}", SUPPORT_PHONE_DISPLAY), onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}) },
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
        emergencyType: "CARDIAC",
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: "SOS · current location",
        // v1.0.15: routes the booking through the cascade engine on
        // server-side. Without this the server falls back to the
        // normal broadcast pool and SOS becomes a regular booking.
        isSos: true
      });
      onBooked(r.booking);
    } catch (e: any) {
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
      setBusy(false);
    }
  };

  return (
    <Screen bg={colors.danger} padding={0} scroll={false}>
      <View style={styles.headerWrap}>
        <AppHeader title="" onBack={onBack} />
      </View>

      <View style={styles.content}>
        <View style={styles.headlineWrap}>
          <Text variant="title" tone="inverse" weight="bold" align="center">
            {t("sos.headline")}
          </Text>
          <Text variant="body" tone="inverse" align="center" style={{ opacity: 0.92 }}>
            {t("sos.headline_sub")}
          </Text>
        </View>

        <View style={styles.ringWrap}>
          <PulseDot size={140} color="#FFFFFF" rings={3} />
          <Animated.View style={[styles.bigButton, { transform: [{ scale: breathe }] }]}>
            <Pressable
              onPress={dispatch}
              android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
              style={styles.bigButtonInner}
              disabled={busy}
            >
              <Text
                variant="title"
                tone="inverse"
                weight="bold"
                style={{ fontSize: 48, lineHeight: 56, letterSpacing: 1, textAlign: "center" }}
              >
                {t("sos.button_label")}
              </Text>
              <Text variant="small" tone="inverse" style={{ opacity: 0.92, marginTop: 4 }}>
                {t("home.sos.tap")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        <Card style={styles.infoCard}>
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
              <IconBadge glyph="!" bg="#FEE2E2" color={colors.danger} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="heading" weight="semi">{t("sos.info_card_title")}</Text>
                <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
                  {t("sos.info_card_body")}
                </Text>
              </View>
              <Pressable
                onPress={() => dialog.alert(t("emergency.disclaimer.title"), t("emergency.disclaimer.body"))}
                accessibilityRole="button"
                accessibilityLabel={t("emergency.disclaimer.title")}
                hitSlop={8}
              >
                <IconBadge glyph="i" size={26} bg={colors.primaryFaint} color={colors.primary} />
              </Pressable>
            </View>
            <Button label={t("sos.cancel_and_back")} variant="outline" onPress={onBack} fullWidth />
            {busy ? (
              <Text variant="small" tone="secondary" align="center">{t("sos.sending")}</Text>
            ) : null}
          </View>
        </Card>
      </View>

      {/* v1.3.x (geofence): out-of-area sheet with the EMERGENCY fallback. A
        * stranded out-of-area SOS must get 108 + support prominently, so we
        * pass emergency so the call-108 block is surfaced above the
        * explanation. Non-blocking when not visible. */}
      <OutOfServiceArea
        visible={outOfAreaVisible}
        onClose={() => setOutOfAreaVisible(false)}
        cityName={area?.cityName ?? "Bareilly"}
        hospitalName={area?.hospitalName}
        radiusKm={area?.radiusKm}
        emergency={true}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: space.lg, paddingTop: space.lg },
  content: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.lg,
    alignItems: "center",
    justifyContent: "space-between"
  },
  headlineWrap: { gap: space.sm, paddingHorizontal: space.md, alignItems: "center" },
  ringWrap: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  bigButton: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6
  },
  bigButtonInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    width: "100%"
  }
});
