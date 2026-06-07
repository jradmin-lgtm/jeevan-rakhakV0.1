import React, { memo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button } from "./Button";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

/**
 * v1.3.1 — small, non-blocking in-ride safety control (Ola / Uber style).
 *
 * This REPLACES the v1.3.0 EmergencyBar, which was a big bottom bar pinned in a
 * full-screen transparent Modal. That Modal sat over the ride screen and ate
 * touches (the Cancel / action buttons stopped working and the screen felt
 * frozen). This component instead renders:
 *   - a tiny header trigger (an SOS chip), so nothing overlays the ride content;
 *   - an on-demand bottom sheet (a Modal that exists ONLY while open) carrying
 *     the confirm, the result, the stand-down, and quick support, all in-app
 *     (no native Alert popups).
 *
 * The screen owns `active` (so a `safety:cleared` socket event can reset it) and
 * supplies async `onRaise` / `onStandDown` that THROW on failure; this component
 * shows the busy + inline error states itself.
 */

type Props = {
  /** An alert raised by this device is currently live (controlled by the screen). */
  active: boolean;
  /** Capture location + raise the alert. Resolve on success, throw Error(message) on failure. */
  onRaise: () => Promise<void>;
  /** Stand the alert down. Resolve on success, throw Error(message) on failure. */
  onStandDown: () => Promise<void>;
  /** Optional support block (e.g. ContactSupport) shown inside the sheet. */
  help?: React.ReactNode;
};

function SafetyButtonInner({ active, onRaise, onStandDown, help }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setConfirming(false);
    setError(null);
  };

  const doRaise = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRaise();
      setConfirming(false);
    } catch (e: any) {
      setError(String(e?.message ?? "Could not send the safety alert. Please try again, or call support."));
    } finally {
      setBusy(false);
    }
  };

  const doStandDown = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onStandDown();
    } catch (e: any) {
      setError(String(e?.message ?? "Could not stand down. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Small header trigger. Filled red while an alert is live so the raiser
        * can see it is active and tap to open the stand-down. */}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Safety and emergency"
        hitSlop={8}
        style={[styles.trigger, active ? styles.triggerActive : null]}
      >
        <Text style={styles.triggerGlyph}>🆘</Text>
        <Text variant="tiny" weight="bold" style={[styles.triggerLabel, active ? styles.triggerLabelActive : null]}>
          {active ? "Active" : "Safety"}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.head}>
              <Text variant="heading" weight="bold">Safety and help</Text>
              <Pressable onPress={close} accessibilityLabel="Close" hitSlop={10}>
                <Text variant="heading" tone="secondary">✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: space.md, paddingBottom: space.lg }} keyboardShouldPersistTaps="handled">
              {active ? (
                <View style={styles.panelActive}>
                  <Text variant="label" tone="danger">SAFETY ALERT ACTIVE</Text>
                  <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
                    Help is being notified. Nearby drivers and our team can see your location.
                  </Text>
                  <Button
                    label="I am safe (stand down)"
                    variant="outline"
                    onPress={() => void doStandDown()}
                    loading={busy}
                    fullWidth
                    style={{ marginTop: space.md }}
                  />
                </View>
              ) : confirming ? (
                <View style={styles.panel}>
                  <Text variant="body" weight="semi">Send a safety alert now?</Text>
                  <Text variant="small" tone="secondary" style={{ marginTop: space.xs }}>
                    Your live location is shared with nearby drivers and our team so help can reach you fast.
                  </Text>
                  <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
                    <View style={{ flex: 1 }}>
                      <Button label="Not now" variant="outline" onPress={() => setConfirming(false)} disabled={busy} fullWidth />
                    </View>
                    <View style={{ flex: 1.3 }}>
                      <Button label="Yes, send alert" variant="danger" onPress={() => void doRaise()} loading={busy} fullWidth />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.panel}>
                  <Text variant="small" tone="secondary">
                    In danger or facing an emergency during the ride? Send a safety alert and we will notify our team and nearby drivers with your live location.
                  </Text>
                  <Button
                    label="🆘  Send safety alert"
                    variant="danger"
                    size="lg"
                    onPress={() => { setError(null); setConfirming(true); }}
                    fullWidth
                    style={{ marginTop: space.md }}
                  />
                </View>
              )}

              {error ? (
                <View style={styles.errorBox}>
                  <Text variant="small" tone="danger">{error}</Text>
                </View>
              ) : null}

              {help ? (
                <View style={{ gap: space.sm }}>
                  <Text variant="label" tone="secondary">CONTACT SUPPORT</Text>
                  {help}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.surface
  },
  triggerActive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger
  },
  triggerGlyph: { fontSize: 13 },
  triggerLabel: { color: colors.danger, letterSpacing: 0.3 },
  triggerLabelActive: { color: "#fff" },

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
    alignItems: "center",
    marginBottom: space.md
  },
  panel: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md
  },
  panelActive: {
    backgroundColor: colors.primaryFaint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: space.md
  },
  errorBox: {
    backgroundColor: "rgba(220,38,38,0.08)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: space.sm
  }
});

export const SafetyButton = memo(SafetyButtonInner);
