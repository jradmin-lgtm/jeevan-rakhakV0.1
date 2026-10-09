import { PushStatusNotice } from "../components/PushStatusNotice";
import { rideCache } from "../rideCache";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  AppHeader,
  Button,
  Card,
  IconBadge,
  ContactSupport,
  LaunchBanner,
  MotionView,
  Screen,
  StatusBadge,
  Text,
  colors,
  space,
  dialog
} from "@jr/ui";
import { Booking, bookings as bookingsApi, me, clearToken, serviceArea as serviceAreaApi } from "../api";
import { useT } from "../i18n";

type Props = {
  profile: any;
  onLogout: () => void;
  onBook: () => void;
  onSos: () => void;
  onTrack: (b: Booking) => void;
  onProfile: () => void;
  onHistory: () => void;
  onSupport: () => void;
};

// Matches server: only one active ride per user. Earlier value of 3 was
// changed in v1.0.11 after pilot testing showed users dispatching multiple
// ambulances unintentionally.
const MAX_ACTIVE_BOOKINGS = 1;

// v1.3.x (geofence): the home banner copy. Falls back to this static default
// if /service-area can't be reached on a cold start, so the ribbon always
// renders something honest (we are live in Bareilly during the pilot).
const DEFAULT_BANNER = { cityName: "Bareilly", hospitalName: "SRMS IMS Hospital", radiusKm: 100 };

export function HomeScreen({ profile, onLogout, onBook, onSos, onTrack, onProfile, onHistory, onSupport }: Props) {
  const { t, lang, setLang } = useT();
  const [accountOpen, setAccountOpen] = useState(false);
  const [active, setActive] = useState<Booking | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState<string | null>(profile?.name ?? null);
  // v1.3.x (geofence): banner copy. Best-effort fetch, keep-last-good — we
  // never blank an already-shown banner if a later refresh fails.
  const [banner, setBanner] = useState<{ cityName: string; hospitalName: string; radiusKm: number }>(DEFAULT_BANNER);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const cacheLoaded = useRef(false);
  const [savedRide, setSavedRide] = useState(false);
  const [cacheError, setCacheError] = useState(false);

  // Slim, non-blocking pull of the public service-area config. Guarded with a
  // mounted flag so we don't setState after the screen unmounts; on failure we
  // simply keep the last-good value (or the static Bareilly default).
  useEffect(() => {
    let mounted = true;
    serviceAreaApi()
      .then((sa) => {
        if (!mounted) return;
        setBanner({ cityName: sa.cityName, hospitalName: sa.hospitalName, radiusKm: 100 });
      })
      .catch((error) => { console.warn("HomeScreen.tsx.HomeScreen failed", error instanceof Error ? error.message : String(error)); });
    return () => { mounted = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    if (!cacheLoaded.current) {
      cacheLoaded.current = true;
      try { const snapshot = await rideCache.load(); if (snapshot) { setActive(snapshot.booking); setSavedRide(true); } }
      catch (error) { console.error("[home] offline ride restore failed", error); setCacheError(true); }
    }
    try {
      const [m, b] = await Promise.all([me.get().catch(() => null), bookingsApi.mine()]);
      if (m?.profile?.name) setName(m.profile.name);
      const liveList = b.bookings.filter((x) =>
        ["REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP"].includes(x.status)
      );
      setActive(liveList[0] ?? null);
      setSavedRide(false);
      try { await rideCache.saveBooking(liveList[0] ?? null); setCacheError(false); }
      catch (error) { console.error("[home] offline ride save failed", error); setCacheError(true); }
      setRefreshError(null);
    } catch (error) {
      console.warn("Home trip refresh failed", error);
      setRefreshError(t("home.refresh_failed"));
      setSavedRide(true);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [t]);

  // 2026-08-12: was a plain mount-only useEffect, so returning to Home via
  // navigation.popToTop() after a ride (LiveTrackingScreen's onClose) reused
  // the same still-mounted Home instance and never refetched. The active-
  // ride card could show stale state instead of the real current ride.
  // useFocusEffect re-runs every time Home becomes the visible screen,
  // including the initial mount, so this replaces the old effect entirely.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const greet = (() => {
    const h = new Date().getHours();
    if (h < 12) return t("home.greet.morning");
    if (h < 17) return t("home.greet.afternoon");
    return t("home.greet.evening");
  })();

  return (
    <Screen bg={colors.surface} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      footer={<View style={{ flexDirection: "row", gap: space.sm }}>
        {[
          { label: t("home.trip_history"), glyph: "◷", action: onHistory, id: "home-history" },
          { label: t("home.medical_profile"), glyph: "◎", action: onProfile, id: "home-profile" },
          { label: t("home.help_short"), glyph: "?", action: onSupport, id: "home-support" }
        ].map(item => <Pressable key={item.id} testID={item.id} accessibilityRole="button" onPress={item.action}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 4, alignItems: "center", justifyContent: "center", gap: 4, opacity: pressed ? 0.6 : 1 })}>
          <Text variant="heading" weight="semi">{item.glyph}</Text>
          <Text variant="tiny" align="center" weight="medium">{item.label}</Text>
        </Pressable>)}
      </View>}>

      <AppHeader
        title={`${greet}${name ? `, ${name.split(" ")[0]}` : ""}`}
        subtitle={t("home.subtitle")}
        right={
          <Pressable
            onPress={() => void setLang(lang === "en" ? "hi" : "en")}
            accessibilityLabel={t("common.switch_language")}
            accessibilityRole="button"
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, minHeight: 44, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999 }}
          >
            <Text variant="small" weight="bold" style={{ color: lang === "en" ? colors.accent : colors.textMuted }}>EN</Text>
            <Text variant="small" tone="muted">|</Text>
            <Text variant="small" weight="bold" style={{ color: lang === "hi" ? colors.accent : colors.textMuted }}>हि</Text>
          </Pressable>
        }
      />

      {/* v1.3.x (geofence): slim Live-in ribbon. Sits at the top of the home
        * content, above the SOS hero. Non-blocking — it never gates the
        * emergency action. */}
      <LaunchBanner
        title={t("home.live_city").replace("{city}", banner.cityName)}
        cityName={banner.cityName}
        subtitle={t("home.banner_serving").replace("{city}", banner.cityName).replace("{radius}", String(banner.radiusKm)).replace("{hospital}", banner.hospitalName)}
      />

      {refreshError && !(savedRide && active) ? <Text variant="small" tone="danger" accessibilityRole="alert">{refreshError}</Text> : null}

      {savedRide && active ? <Text variant="small" tone="secondary">{t("offline.saved_ride")}</Text> : null}
      {cacheError ? <Text variant="small" tone="danger">{t("offline.storage_error")}</Text> : null}
      {active ? (
        <Card style={{ borderColor: colors.borderStrong, borderWidth: 1 }} onPress={() => onTrack(active)}>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="label" tone="secondary">{t("home.active_trip")}</Text>
              <StatusBadge label={t(`status.${active.status}`)} status={active.status} />
            </View>
            <Text variant="heading">{prettyEmergency(active.emergencyType, t)}</Text>
            <Text variant="small" tone="secondary">
              {t("home.pickup_prefix").replace("{address}", String(active.pickupAddress ?? `${active.pickupLat.toFixed(4)}, ${active.pickupLng.toFixed(4)}`))}
            </Text>
            <Button label={t("home.open_tracking")} style={{ backgroundColor: colors.textPrimary }} onPress={() => onTrack(active)} fullWidth />
          </View>
        </Card>
      ) : (
        <>
          <MotionView style={sosStyles.heroWrap}>
            <Text variant="title" weight="bold">{t("home.need_ambulance")}</Text>
            <Text variant="small" tone="secondary">{t("home.need_ambulance.sub")}</Text>
            <Pressable onPress={onSos} style={({ pressed }) => [sosStyles.emergencyTile, pressed ? { opacity: 0.85 } : null]}
              testID="sos-cta" accessibilityRole="button" accessibilityLabel={t("home.sos_a11y")}>
              <View style={sosStyles.sosMark}><Text variant="heading" weight="bold" tone="inverse">{t("home.sos_short")}</Text></View>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text variant="heading" weight="bold" tone="inverse">{t("home.emergency_cta")}</Text>
                <Text variant="small" tone="inverse">{t("home.sos.tap")}</Text>
              </View>
              <Text variant="heading" tone="inverse">›</Text>
            </Pressable>
            <Pressable onPress={onBook} style={({ pressed }) => [sosStyles.bookPrimary, pressed ? { opacity: 0.85 } : null]}
              testID="book-cta" accessibilityRole="button">
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text variant="heading" weight="bold" tone="inverse">{t("home.book_card.title")}</Text>
                <Text variant="small" tone="inverse">{t("home.book_services")}</Text>
              </View>
              <Text variant="heading" tone="inverse">›</Text>
            </Pressable>
            <Pressable onPress={() => dialog.alert(t("emergency.disclaimer.title"), t("emergency.disclaimer.body"))}
              accessibilityRole="button" style={sosStyles.disclaimer}>
              <IconBadge glyph="i" size={24} bg={colors.bg} color={colors.textSecondary} />
              <Text variant="small" tone="secondary" style={{ flex: 1 }}>{t("emergency.disclaimer.title")}</Text>
              <Text variant="body" tone="secondary">›</Text>
            </Pressable>
          </MotionView>
        </>
      )}

      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: accountOpen }} onPress={() => setAccountOpen(value => !value)} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="small" weight="medium">{t("home.account_options")}</Text><Text>{accountOpen ? "⌃" : "⌄"}</Text>
        </Pressable>
        {accountOpen ? <View style={{ gap: space.sm }}>
          <Button label={t("home.sign_out")} variant="ghost" onPress={async () => { await clearToken(); onLogout(); }} />
          <Button
            label={t("delete.button")}
            variant="ghost"
            onPress={async () => {
              if (
                await dialog.confirm({
                  title: t("delete.title"),
                  message: t("delete.body"),
                  confirmText: t("delete.confirm"),
                  cancelText: t("delete.cancel"),
                  destructive: true
                })
              ) {
                try {
                  await me.delete();
                  // Same teardown path as sign-out — wipe JWT, revoke
                  // Google session, then route back to login.
                  await clearToken();
                  onLogout();
                } catch (e: any) {
                  const msg = String(e?.message ?? "");
                  if (msg.includes("ride_in_progress")) {
                    void dialog.alert(t("delete.in_progress_title"), t("delete.in_progress_body"));
                  } else {
                    void dialog.alert(t("delete.error_generic"), e?.message ?? "");
                  }
                }
              }
            }}
          />
        </View> : null}
      </View>

      {/* v1.2.4 (helpdesk): a tap-through into the two-way Help & Support
        * screen (raise a request + chat with the team). The static
        * <PushStatusNotice />
      <ContactSupport lang={lang} /> card below is kept as-is : it still carries the
        * call/email lines + the "Available daily, 8 AM – 11 PM IST" hours
        * text — so users who just want to phone in are unaffected. */}
      <Pressable
        onPress={onSupport}
        style={sosStyles.bookTile}
        testID="support-cta"
        android_ripple={{ color: "rgba(0,0,0,0.04)" }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="body" weight="semi">{t("home.get_help")}</Text>
          <Text variant="tiny" tone="secondary">{t("home.get_help.sub")}</Text>
        </View>
        <Text variant="heading" tone="primary" weight="bold">→</Text>
      </Pressable>

      <PushStatusNotice />
      <ContactSupport lang={lang} />

      <Text variant="tiny" tone="muted" align="center">
        {t("home.made_with_care")}
      </Text>
    </Screen>
  );
}

const sosStyles = StyleSheet.create({
  heroWrap: { gap: space.md, paddingVertical: space.sm },
  emergencyTile: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 96, padding: 18, borderRadius: 16, backgroundColor: colors.primaryDark },
  sosMark: { width: 56, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  bookPrimary: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: 88, padding: 18, borderRadius: 16, backgroundColor: colors.textPrimary },
  disclaimer: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  bookTile: { flexDirection: "row", alignItems: "center", gap: space.md, width: "100%", paddingVertical: space.md, paddingHorizontal: space.lg, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }
});

// CR3 (2026-08): now takes the caller's translate fn so this pill label
// localizes instead of always rendering English. Param renamed
// emergencyType (was shadowing the usual `t()` translate-fn name).
export function prettyEmergency(emergencyType: string, translate: (key: string) => string): string {
  switch (emergencyType) {
    case "ACCIDENT_TRAUMA": return translate("emergency.accident.label");
    case "CARDIAC": return translate("emergency.cardiac.label");
    case "BREATHING_DISTRESS": return translate("emergency.breathing.label");
    case "PREGNANCY_NEONATAL": return translate("emergency.pregnancy_neonatal.pill_label");
    case "REFERRAL_AMBULANCE": return translate("emergency.referral.label");
    case "OPD_AMBULANCE": return translate("emergency.opd.label");
    case "GENERAL_CRITICAL_TRANSFER": return translate("emergency.critical_transfer.label");
    default: return emergencyType;
  }
}
