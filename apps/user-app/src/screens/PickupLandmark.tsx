import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Input, MotionView, Text, colors, space } from "@jr/ui";
import { places, type NearbyLandmark } from "../api";
import { useT } from "../i18n";

type Props = { lat: number; lng: number; value: string; onChange: (value: string) => void };

export function PickupLandmark({ lat, lng, value, onChange }: Props) {
  const { t, lang } = useT();
  const [suggestions, setSuggestions] = useState<NearbyLandmark[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let active = true;
    setSuggestions([]);
    setState("loading");
    const timer = setTimeout(() => {
      places.landmarks(lat, lng, lang).then(result => {
        if (!active) return;
        setSuggestions(result.landmarks);
        setState(result.landmarks.length ? "ready" : "unavailable");
      }).catch(error => {
        console.warn("Nearby landmarks unavailable", error instanceof Error ? error.message : "request failed");
        if (active) setState("unavailable");
      });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [lat, lng, lang, attempt]);

  return <View style={styles.section} testID="pickup-landmark-section">
    <View style={styles.heading}>
      <Text variant="heading" style={{ flex: 1 }}>{t("landmark.title")}</Text>
      {value ? <Button label={t("landmark.clear")} variant="ghost" onPress={() => onChange("")} testID="clear-landmark" /> : null}
    </View>
    <Text variant="small" tone="secondary">{t("landmark.hint")}</Text>
    <MotionView changeKey={state + lang} style={{ gap: space.sm }}>
      {state === "loading" ? <Text variant="small" tone="secondary" accessibilityLiveRegion="polite">{t("landmark.loading")}</Text> : null}
      {state === "ready" ? <>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
          {suggestions.map((item, index) => {
            const selected = value === item.label;
            return <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected }}
              accessibilityLabel={`${item.name}, ${item.distanceMeters} ${t("landmark.metres")}`}
              testID={`landmark-choice-${index}`} onPress={() => { onChange(item.label); setEditing(false); }}
              style={({ pressed }) => [styles.choice, selected && styles.selected, pressed && { opacity: 0.75 }]}>
              <Text variant="small" weight="semi" style={selected ? { color: colors.surface } : undefined}>{selected ? "✓ " : ""}{item.name}</Text>
              <Text variant="tiny" style={selected ? { color: colors.surface } : { color: colors.textSecondary }}>{item.distanceMeters} {t("landmark.metres")}</Text>
            </Pressable>;
          })}
        </ScrollView>
        <Text variant="tiny" tone="secondary">Google Maps · {t("landmark.browse")}</Text>
      </> : null}
      {state === "unavailable" ? <View style={styles.heading}>
        <Text variant="small" tone="secondary" style={{ flex: 1 }}>{t("landmark.unavailable")}</Text>
        <Button label={t("landmark.retry")} variant="ghost" onPress={() => setAttempt(n => n + 1)} testID="retry-landmarks" />
      </View> : null}
    </MotionView>
    {!editing && !value && state !== "unavailable" ? <Pressable testID="add-manual-landmark" accessibilityRole="button" onPress={() => setEditing(true)} style={styles.manualAction}>
      <Text variant="body" weight="semi">+  {t("landmark.add_own")}</Text>
      <Text variant="body" tone="secondary">›</Text>
    </Pressable> : null}
    {value && !editing && state !== "unavailable" ? <Pressable testID="edit-landmark" accessibilityRole="button" onPress={() => setEditing(true)} style={styles.summary}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text variant="tiny" tone="success" weight="semi">{t("landmark.saved")}</Text><Text variant="body" weight="semi">{value}</Text></View>
      <Text variant="small" tone="primary" weight="semi">{t("landmark.edit")}</Text>
    </Pressable> : null}
    {editing || state === "unavailable" ? <Input label={t("landmark.input_label")} value={value} onChangeText={onChange} maxLength={240}
      placeholder={t("landmark.placeholder")} multiline numberOfLines={3} textAlignVertical="top"
      style={{ minHeight: 88, maxHeight: 160 }} testID="pickup-landmark-input" /> : null}
    {value.trim().length >= 2 ? <Text variant="tiny" tone="success" accessibilityLiveRegion="polite">{t("landmark.confirmed")}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  heading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  choices: { gap: 8, paddingVertical: 2 },
  manualAction: { minHeight: 50, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  summary: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, backgroundColor: "#EDF7F2" },
  choice: { width: 210, minHeight: 76, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 3 },
  selected: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }
});
