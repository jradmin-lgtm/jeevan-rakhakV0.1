import React, { useCallback, useState } from "react";
import { AppState, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, Text, space } from "@jr/ui";
import { flushLocationQueue, locationQueueStatus } from "../locationQueue";
import { useT } from "../i18n";

export function LocationSyncNotice() {
  const { t } = useT();
  const [state, setState] = useState<{ pending: number; error: string | null; expired: number } | null>(null);
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
        if (active) setState({ pending: 0, expired: 0, error: t("sync.storage_error") });
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
      <Text variant="small" weight="semi" style={{ flex: 1 }}>{state.pending > 0 ? t("sync.pending").replace("{count}", String(state.pending)) : t("sync.title")}</Text>
      {state.pending > 0 || state.error ? <Button label={t("sync.retry")} variant="ghost" onPress={() => setRetry(value => value + 1)} /> : null}
    </View>
    {state.error ? <Text variant="tiny" tone="danger" accessibilityRole="alert">{state.error === t("sync.storage_error") ? state.error : state.error.startsWith("Offline location storage") ? t("sync.full") : t("sync.retry_hint")}</Text> : null}
    {state.expired > 0 ? <Text variant="tiny" tone="danger">{t("sync.expired").replace("{count}", String(state.expired))}</Text> : null}
  </View></Card>;
}
