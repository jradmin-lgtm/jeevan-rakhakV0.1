import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "./Button";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

type Props = {
  active: boolean; // an alert is currently raised by this device
  busy?: boolean; // request in flight
  onEmergency: () => void; // screen wires confirm + raise
  onHelp: () => void; // screen opens the Help & Support sheet
  onStandDown?: () => void; // visible when active
};

function EmergencyBarInner({ active, busy, onEmergency, onHelp, onStandDown }: Props) {
  // Active: a calm panel. The alert is already out, so we reassure the
  // raiser that help is on the way and offer a single stand down action.
  if (active) {
    return (
      <View style={styles.bar}>
        <View style={styles.panel}>
          <Text variant="label" tone="danger">SAFETY ALERT ACTIVE</Text>
          <Text variant="small" tone="secondary" style={styles.panelBody}>
            Help is being notified. Nearby drivers and our team can see your location.
          </Text>
          <Button
            label="I am safe (stand down)"
            variant="outline"
            onPress={onStandDown}
            loading={busy}
            disabled={!onStandDown}
            fullWidth
            style={styles.standDown}
          />
        </View>
      </View>
    );
  }

  // Idle: a prominent danger Emergency button next to an outline Help button.
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <View style={styles.emergencyCell}>
          <Button
            label="🆘  Emergency"
            variant="danger"
            size="lg"
            onPress={onEmergency}
            loading={busy}
            fullWidth
          />
        </View>
        <View style={styles.helpCell}>
          <Button
            label="Help and Support"
            variant="outline"
            size="lg"
            onPress={onHelp}
            disabled={busy}
            fullWidth
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Pinned to the bottom of the live ride screen. The screen positions this
  // bar; here we only own the surface chrome and safe inner padding.
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.lg
  },
  row: {
    flexDirection: "row",
    gap: space.sm
  },
  // Emergency takes the larger share so it reads as the primary action.
  emergencyCell: { flex: 1.4 },
  helpCell: { flex: 1 },
  panel: {
    backgroundColor: colors.primaryFaint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: space.md
  },
  panelBody: { marginTop: space.xs },
  standDown: { marginTop: space.md }
});

export const EmergencyBar = memo(EmergencyBarInner);
