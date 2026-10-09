import React, { useCallback, useState } from "react";
import { AppState, NativeModules, Platform, Pressable, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import { Button, Card, Text, colors, space } from "@jr/ui";
import { useT } from "../i18n";
import { registerPushToken } from "../push";

type AlertStatus = {
  notificationsEnabled: boolean; policyAccess: boolean; alarmVolume: number;
  sosEnabled: boolean; bookingEnabled: boolean; sosBypass: boolean; bookingBypass: boolean;
  interruptionFilter: number;
};
const native = NativeModules.JRPriorityAlerts as {
  status(): Promise<AlertStatus>;
  openSettings(kind: string): Promise<void>;
  test(kind: string, title: string, body: string): Promise<void>;
} | undefined;

export function PriorityAlertSettings() {
  const { t } = useT();
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "android") return;
    let active = true;
    const refresh = async () => {
      try {
        if (!native) throw new Error("Priority alert module missing from this build");
        const value = await native.status();
        if (active) { setStatus(value); setError(null); }
      } catch (cause) {
        console.error("[alerts] settings check failed", cause);
        if (active) setError(t("alerts.check_failed"));
      }
    };
    void refresh();
    const sub = AppState.addEventListener("change", next => { if (next === "active") void refresh(); });
    return () => { active = false; sub.remove(); };
  }, [t]));
  if (Platform.OS !== "android") return null;
  const ready = status && status.notificationsEnabled && status.sosEnabled && status.bookingEnabled && status.alarmVolume > 0 && status.policyAccess && status.sosBypass && status.bookingBypass && status.interruptionFilter !== 3 && status.interruptionFilter !== 4;
  const act = async (kind: string) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      if (!native) throw new Error("Priority alert module missing from this build");
      if (kind === "permissions") {
        const permission = await Notifications.requestPermissionsAsync();
        if (permission.granted) await registerPushToken();
        else await native.openSettings("notifications");
      } else if (kind.startsWith("test_")) {
        await native.test(kind.slice(5), t(kind === "test_sos" ? "alerts.test_sos_title" : "alerts.test_booking_title"), t("alerts.test_body"));
        setMessage(t("alerts.test_sent"));
      } else { await native.openSettings(kind); }
      setStatus(await native.status());
    } catch (cause) {
      console.error("[alerts] action failed", cause);
      setError(t("alerts.action_failed"));
    } finally { setBusy(false); }
  };
  return <Card flat>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 48, justifyContent: "center", gap: 4 }} testID="alert-settings-toggle">
      <Text weight="bold">{t("alerts.title")}</Text>
      <Text variant="small" tone={ready ? "secondary" : "danger"}>{error || (status ? t(ready ? "alerts.ready" : "alerts.needs_setup") : t("alerts.checking"))}</Text>
      <Text variant="small" style={{ color: colors.textPrimary }}>{t(expanded ? "alerts.hide" : "alerts.manage")}</Text>
    </Pressable>
    {expanded ? <View style={{ gap: space.sm, paddingTop: space.md }}>
      <Text variant="small" tone="secondary">{t("alerts.description")}</Text>
      {status ? <>
        <Text variant="small">{t("alerts.notification_status")} {t(status.notificationsEnabled && status.sosEnabled && status.bookingEnabled ? "alerts.enabled" : "alerts.disabled")}</Text>
        <Text variant="small">{t("alerts.priority_status")} {t(status.policyAccess && status.sosBypass && status.bookingBypass ? "alerts.enabled" : "alerts.disabled")}</Text>
        {status.alarmVolume === 0 ? <Text variant="small" tone="danger">{t("alerts.volume_zero")}</Text> : null}
        {status.interruptionFilter === 3 || status.interruptionFilter === 4 ? <Text variant="small" tone="danger">{t("alerts.restrictive_mode")}</Text> : null}
        {!status.notificationsEnabled ? <Button label={t("alerts.allow_notifications")} variant="neutral" disabled={busy} onPress={() => void act("permissions")} /> : null}
        {!status.policyAccess ? <Button label={t("alerts.allow_priority")} variant="neutral" disabled={busy} onPress={() => void act("priority")} /> : null}
      </> : null}
      <Button label={t("alerts.sos_settings")} variant="neutral" disabled={busy} onPress={() => void act("sos")} />
      <Button label={t("alerts.booking_settings")} variant="neutral" disabled={busy} onPress={() => void act("booking")} />
      <Button label={t("alerts.volume_settings")} variant="neutral" disabled={busy} onPress={() => void act("volume")} />
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <View style={{ flex: 1 }}><Button label={t("alerts.test_sos")} variant="outline" disabled={busy} onPress={() => void act("test_sos")} testID="test-sos-sound" /></View>
        <View style={{ flex: 1 }}><Button label={t("alerts.test_booking")} variant="outline" disabled={busy} onPress={() => void act("test_booking")} testID="test-booking-sound" /></View>
      </View>
      {message ? <Text variant="small" accessibilityLiveRegion="polite">{message}</Text> : null}
      {error ? <Text variant="small" tone="danger" accessibilityRole="alert">{error}</Text> : null}
      <Text variant="small" tone="secondary">{t("alerts.limit")}</Text>
    </View> : null}
  </Card>;
}
