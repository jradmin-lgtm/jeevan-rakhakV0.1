import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, colors, radius, space } from "@jr/ui";
import { EmergencyType } from "../api";
import { EMERGENCY_KEYS } from "../constants/emergencyCategories";
import { useT } from "../i18n";

/**
 * 2026-08-17: fixes a real bug, not a missing feature — the SOS button used
 * to hardcode `emergencyType: "CARDIAC"` for every emergency regardless of
 * what was actually happening. Tapping a tile here IS the confirmation (no
 * separate confirm dialog): the booking is created immediately on selection.
 * Same tile styling as BookAmbulanceScreen's picker, same 5 categories — same
 * bottom-sheet skeleton as packages/ui's OutOfServiceArea (backdrop-dismiss,
 * handle, scrollable body), but SOS-only so it lives in the app, not @jr/ui.
 */

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: EmergencyType) => void;
};

export function SosCategoryPicker({ visible, onClose, onSelect }: Props) {
  const { t } = useT();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t("common.cancel")} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text variant="heading" weight="bold">{t("sos.picker_title")}</Text>
              <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
                {t("sos.picker_subtitle")}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityLabel={t("common.cancel")} hitSlop={10}>
              <Text variant="heading" tone="secondary">✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {EMERGENCY_KEYS.map((e) => (
              <Pressable
                key={e.key}
                onPress={() => onSelect(e.key)}
                android_ripple={{ color: "rgba(0,0,0,0.04)" }}
                style={styles.tile}
                testID={`sos-emergency-${e.key}`}
              >
                <View style={styles.emoji}>
                  <Text variant="heading" style={{ color: colors.primary }}>{e.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="body" weight="semi">{t(e.labelKey)}</Text>
                  <Text variant="small" tone="secondary">{t(e.subKey)}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xl,
    maxHeight: "82%"
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space.md
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: space.md,
    gap: space.md
  },
  body: {
    gap: space.sm,
    paddingBottom: space.lg
  },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border
  },
  emoji: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primaryFaint,
    alignItems: "center",
    justifyContent: "center"
  }
});
