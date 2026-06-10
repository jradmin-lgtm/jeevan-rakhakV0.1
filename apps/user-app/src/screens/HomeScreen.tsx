import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import {
  AppHeader,
  Button,
  Card,
  IconBadge,
  ContactSupport,
  LaunchBanner,
  Pill,
  PulseDot,
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
const DEFAULT_BANNER = { cityName: "Bareilly", hospitalName: "SRMS IMS Hospital", radiusKm: 1000 };

export function HomeScreen({ profile, onLogout, onBook, onSos, onTrack, onProfile, onHistory, onSupport }: Props) {
  const { t, lang, setLang } = useT();
  const [active, setActive] = useState<Booking | null>(null);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState<string | null>(profile?.name ?? null);
  // v1.3.x (geofence): banner copy. Best-effort fetch, keep-last-good — we
  // never blank an already-shown banner if a later refresh fails.
  const [banner, setBanner] = useState<{ cityName: string; hospitalName: string; radiusKm: number }>(DEFAULT_BANNER);
  const breathe = useRef(new Animated.Value(1)).current;

  // Slim, non-blocking pull of the public service-area config. Guarded with a
  // mounted flag so we don't setState after the screen unmounts; on failure we
  // simply keep the last-good value (or the static Bareilly default).
  useEffect(() => {
    let mounted = true;
    serviceAreaApi()
      .then((sa) => {
        if (!mounted) return;
        setBanner({ cityName: sa.cityName, hospitalName: sa.hospitalName, radiusKm: sa.radiusKm });
      })
      .catch(() => {
        /* keep-last-good — banner already shows the default */
      });
    return () => { mounted = false; };
  }, []);

  // Subtle breathing animation on the central SOS button. Drives "this is
  // alive, tap me" affordance during an emergency without being so loud it
  // looks broken when the user is just looking at the home screen calmly.
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1200, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [m, b] = await Promise.all([me.get().catch(() => null), bookingsApi.mine()]);
      if (m?.profile?.name) setName(m.profile.name);
      const liveList = b.bookings.filter((x) =>
        ["REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP"].includes(x.status)
      );
      setActiveCount(liveList.length);
      setActive(liveList[0] ?? null);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const greet = (() => {
    const h = new Date().getHours();
    if (h < 12) return t("home.greet.morning");
    if (h < 17) return t("home.greet.afternoon");
    return t("home.greet.evening");
  })();

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <AppHeader
        title={`${greet}${name ? `, ${name.split(" ")[0]}` : ""}`}
        subtitle={t("home.subtitle")}
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

      {/* v1.3.x (geofence): slim Live-in ribbon. Sits at the top of the home
        * content, above the SOS hero. Non-blocking — it never gates the
        * emergency action. */}
      <LaunchBanner
        cityName={banner.cityName}
        subtitle={"Serving " + banner.cityName + " within " + banner.radiusKm + " km of " + banner.hospitalName}
      />

      {active ? (
        <Card style={{ borderColor: colors.primary, borderWidth: 1.5 }} onPress={() => onTrack(active)}>
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="label" tone="secondary">{t("home.active_trip")}</Text>
              <StatusBadge status={active.status} />
            </View>
            <Text variant="heading">{prettyEmergency(active.emergencyType)}</Text>
            <Text variant="small" tone="secondary">
              Pickup: {active.pickupAddress ?? `${active.pickupLat.toFixed(4)}, ${active.pickupLng.toFixed(4)}`}
            </Text>
            <Button label={t("home.open_tracking")} onPress={() => onTrack(active)} fullWidth />
          </View>
        </Card>
      ) : (
        <>
          {/* v1.0.11 redesign — the SOS button is the primary visual focus.
            * Pilot testers reported the previous two-button layout buried the
            * emergency action. The big circle is unmistakable and works for
            * elderly / panicked / unfamiliar users. */}
          <View style={sosStyles.heroWrap}>
            <Text variant="title" weight="bold" align="center">{t("home.need_ambulance")}</Text>
            <Text variant="small" tone="secondary" align="center" style={{ marginTop: 4 }}>
              {t("home.need_ambulance.sub")}
            </Text>
            <Pressable
              onPress={() => dialog.alert(t("emergency.disclaimer.title"), t("emergency.disclaimer.body"))}
              accessibilityRole="button"
              accessibilityLabel={t("emergency.disclaimer.title")}
              hitSlop={8}
              style={{ marginTop: 8, alignSelf: "center" }}
            >
              <IconBadge glyph="i" size={26} bg={colors.primaryFaint} color={colors.primary} />
            </Pressable>

            <View style={sosStyles.ringWrap}>
              <PulseDot size={120} color={colors.danger} rings={3} />
              <Animated.View style={[sosStyles.bigButton, { transform: [{ scale: breathe }] }]}>
                <Pressable
                  onPress={onSos}
                  android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
                  style={sosStyles.bigButtonInner}
                  testID="sos-cta"
                  accessibilityRole="button"
                  accessibilityLabel="Emergency SOS · dispatch ambulance now"
                >
                  {/* v1.0.14: dropped letterSpacing 3 → 1 to fix the "O
                    * off-centre" artifact. Earlier draft also set
                    * includeFontPadding:false which removed Android's
                    * baseline padding and shifted the whole text block
                    * upward inside the circle — leaving empty red space
                    * below. Reverted; just the letterSpacing fix is enough. */}
                  <Text
                    variant="title"
                    tone="inverse"
                    weight="bold"
                    style={{ fontSize: 52, lineHeight: 60, letterSpacing: 1, textAlign: "center" }}
                  >
                    SOS
                  </Text>
                  <Text variant="small" tone="inverse" style={{ opacity: 0.95, marginTop: 2 }}>{t("home.sos.tap")}</Text>
                </Pressable>
              </Animated.View>
            </View>

            <Pressable onPress={onBook} style={sosStyles.bookTile} testID="book-cta" android_ripple={{ color: "rgba(0,0,0,0.04)" }}>
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="semi">{t("home.book_card.title")}</Text>
                <Text variant="tiny" tone="secondary">{t("home.book_card.sub")}</Text>
              </View>
              <Text variant="heading" tone="primary" weight="bold">→</Text>
            </Pressable>
          </View>
        </>
      )}

      {activeCount > 0 ? (
        <Card flat>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text variant="label" tone="secondary">{t("home.active_ride")}</Text>
              <Text variant="body">{t("home.active_ride.sub")}</Text>
            </View>
            <Pill label={t("home.active.pill")} color={colors.danger} bg={colors.primaryFaint} />
          </View>
        </Card>
      ) : null}

      <Card flat>
        <View style={{ gap: space.md }}>
          <Text variant="label" tone="secondary">{t("home.quick_actions")}</Text>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Button label={t("home.trip_history")} variant="outline" onPress={onHistory} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <Button label={t("home.medical_profile")} variant="outline" onPress={onProfile} fullWidth />
            </View>
          </View>
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
        </View>
      </Card>

      {/* v1.2.4 (helpdesk): a tap-through into the two-way Help & Support
        * screen (raise a request + chat with the team). The static
        * <ContactSupport /> card below is kept as-is — it still carries the
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

      <ContactSupport />

      <Text variant="tiny" tone="muted" align="center">
        {t("home.made_with_care")}
      </Text>
    </Screen>
  );
}

const sosStyles = StyleSheet.create({
  heroWrap: { gap: space.lg, paddingVertical: space.md, alignItems: "center" },
  ringWrap: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: space.sm
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
    borderColor: "rgba(255,255,255,0.85)",
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8
  },
  bigButtonInner: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  bookTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    width: "100%",
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface
  }
});

export function prettyEmergency(t: string): string {
  switch (t) {
    case "ACCIDENT_TRAUMA": return "Accident / Trauma";
    case "CARDIAC": return "Cardiac";
    case "BREATHING_DISTRESS": return "Breathing distress";
    case "PREGNANCY_NEONATAL": return "Pregnancy / Neonatal";
    case "GENERAL_CRITICAL_TRANSFER": return "Critical transfer";
    default: return t;
  }
}
