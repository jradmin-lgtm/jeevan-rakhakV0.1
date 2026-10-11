import React, { useCallback, useState } from "react";
import { AppState, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, Text, space } from "@jr/ui";
import { flushLocationQueue, locationQueueStatus } from "../locationQueue";
import { useT } from "../i18n";

export function LocationSyncNotice() {
  const { t, lang } = useT();
  const [state, setState] = useState<{ pending: number | null; error: string | null; expired: number } | null>(null);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    let running = false;
    const sync = async () => {
      if (running || AppState.currentState !== "active") return;
      running = true;
      try {
        try { await flushLocationQueue(); }
        catch (error) { console.warn("[gps] reconnect sync pending", error); }
        const next = await locationQueueStatus();
        if (active) setState(next);
      } catch (error) {
        console.error("[gps] queue status unavailable", error);
        if (active) setState({ pending: null, expired: 0, error: t("sync.storage_error") });
      } finally { running = false; }
    };
    void sync();
    const timer = setInterval(() => void sync(), 15_000);
    const subscription = AppState.addEventListener("change", next => { if (next === "active") void sync(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [retry, t]));
  if (!state || (!state.pending && !state.error && !state.expired)) return null;
  return <Card flat padding="sm"><View style={{ gap: space.xs }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Text variant="small" weight="semi" style={{ flex: 1 }}>{(state.pending ?? 0) > 0 ? t("sync.pending").replace("{count}", String(state.pending)) : t("sync.title")}</Text>
      {(state.pending ?? 0) > 0 || state.error ? <Button label={t("sync.retry")} variant="ghost" onPress={() => setRetry(value => value + 1)} /> : null}
    </View>
    {state.error ? <Text variant="small" tone="danger" accessibilityRole="alert">{state.error === t("sync.storage_error") ? state.error : state.error.startsWith("Offline location storage") ? t("sync.full") : /unauthorized|expired|invalid.token|401/i.test(state.error) ? (lang === "hi" ? "फिर से साइन इन करें। सहेजा गया रूट सुरक्षित है।" : "Sign in again to sync. Your saved route is retained.") : /not_assigned|invalid_location|future_location|acknowledge/i.test(state.error) ? (lang === "hi" ? "सर्वर ने रूट स्वीकार नहीं किया। सहायता से संपर्क करें। सहेजा गया रूट सुरक्षित है।" : "The server could not accept this route. Contact support. Saved points are retained.") : t("sync.retry_hint")}</Text> : null}
    {state.expired > 0 ? <Text variant="small" tone="danger">{t("sync.expired").replace("{count}", String(state.expired))}</Text> : null}
  </View></Card>;
}
