import React from "react";
import { Pressable } from "react-native";
import { Text, colors } from "@jr/ui";
import { useT } from "../i18n";

/**
 * v1.1.0 (CR#11) — global EN | हि language switcher. Dropped into the
 * AppHeader `right` slot on every major driver screen so the driver can flip
 * language from anywhere without a Settings detour. Selection persists via
 * the i18n module (AsyncStorage key `jr.lang.driver`) and applies instantly
 * (useT re-renders subscribers). 🌐 glyph keeps it recognisable.
 */
export function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <Pressable
      onPress={() => void setLang(lang === "en" ? "hi" : "en")}
      accessibilityLabel="Switch language"
      hitSlop={8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: "rgba(30,94,255,0.10)",
        borderRadius: 999
      }}
    >
      <Text variant="small">🌐</Text>
      <Text variant="small" weight="bold" style={{ color: lang === "en" ? colors.accent : "#94A3B8" }}>EN</Text>
      <Text variant="small" tone="muted">|</Text>
      <Text variant="small" weight="bold" style={{ color: lang === "hi" ? colors.accent : "#94A3B8" }}>हि</Text>
    </Pressable>
  );
}
