import React, { useEffect, useRef, useState } from "react";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Button, Input, Text, colors, radius, space } from "@jr/ui";
import { rideCancel } from "../api";
import { useT } from "../i18n";

type Props = {
  bookingId: string;
  patientPhone?: string;
  onCancelled: (outcome: string) => void;
  onClose: () => void;
};

/**
 * v1.2.0 (CR#2) — driver-initiated cancellation sheet.
 *
 * Two reason buckets:
 *  - Patient reasons (not at pickup / not responding) → server anchors a wait
 *    clock via /cancel/start-wait; the driver must let a server-authoritative
 *    countdown elapse before "Confirm cancellation" enables. We render a live
 *    mm:ss countdown + a one-tap "Call patient" button so the driver actually
 *    tries to reach them during the window.
 *  - Vehicle / operational / Other → always confirmable; on confirm the booking
 *    is re-dispatched to the next ambulance and this driver is freed.
 *
 * "Other" requires ≥10 chars of remarks (mirrors the server's own gate) with a
 * live counter. The countdown interval is cleared on unmount AND the moment the
 * driver confirms (audit gate item 4 — no orphaned timers).
 */
const REASONS = [
  { code: "PATIENT_NOT_AVAILABLE", patient: true },
  { code: "PATIENT_NOT_RESPONDING", patient: true },
  { code: "VEHICLE_BREAKDOWN", patient: false },
  { code: "TYRE_PUNCTURE", patient: false },
  { code: "CANNOT_REACH_PICKUP", patient: false },
  { code: "OTHER", patient: false }
] as const;

const MIN_REMARKS = 10;

function isPatientReason(code: string | null): boolean {
  return REASONS.some((r) => r.code === code && r.patient);
}

function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function CancelRideSheet({ bookingId, patientPhone, onCancelled, onClose }: Props) {
  const { t } = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  // null until a patient-reason wait clock has been started; once set it counts
  // down to 0, at which point confirm enables.
  const [remaining, setRemaining] = useState<number | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = () => {
    if (interval.current) {
      clearInterval(interval.current);
      interval.current = null;
    }
  };

  // Always clear the countdown on unmount (audit gate item 4).
  useEffect(() => clearTick, []);

  const onSelect = async (code: string) => {
    setSelected(code);
    setRemarks("");
    // Patient reasons start the server-authoritative wait clock immediately so
    // the countdown reflects the real anchor (idempotent on the server).
    if (isPatientReason(code)) {
      clearTick();
      setRemaining(null);
      try {
        const r = await rideCancel.startWait(bookingId);
        // Re-derive remaining from the server anchor so a re-select doesn't
        // reset an already-running clock the server is enforcing.
        const startedMs = new Date(r.waitStartedAt).getTime();
        const elapsed = (Date.now() - startedMs) / 1000;
        let secs = Math.max(0, Math.ceil(r.waitSeconds - elapsed));
        setRemaining(secs);
        clearTick();
        interval.current = setInterval(() => {
          secs -= 1;
          if (secs <= 0) {
            secs = 0;
            clearTick();
          }
          setRemaining(secs);
        }, 1000);
      } catch (e: any) {
        // Reset selection so the sheet doesn't sit on a frozen 00:00 with a
        // permanently-disabled Confirm and no countdown — the driver can re-tap
        // the reason to retry the wait clock.
        clearTick();
        setSelected(null);
        setRemaining(null);
        Alert.alert("Could not start wait", e?.message ?? "Tap the reason again to retry.");
      }
    } else {
      // Non-patient reason → no wait gate.
      clearTick();
      setRemaining(null);
    }
  };

  const remarksTooShort =
    selected === "OTHER" && remarks.trim().length < MIN_REMARKS;
  const waitNotElapsed = isPatientReason(selected) && (remaining == null || remaining > 0);
  const confirmDisabled = !selected || busy || remarksTooShort || waitNotElapsed;

  const confirm = async () => {
    if (!selected || confirmDisabled) return;
    setBusy(true);
    try {
      const r = await rideCancel.cancel(
        bookingId,
        selected,
        selected === "OTHER" ? remarks.trim() : undefined
      );
      // Stop the timer the moment the cancellation lands (audit gate item 4).
      clearTick();
      onCancelled(r.outcome);
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("cancel_wait_not_elapsed")) {
        // Server says the wait window is still open — re-derive the remaining
        // seconds from the error if available, else keep the local countdown.
        const remainingS = (e as any)?.remainingS;
        if (typeof remainingS === "number") setRemaining(remainingS);
        Alert.alert("Please wait", t("cancel.wait_countdown_hint"));
      } else if (msg.includes("remarks_required")) {
        Alert.alert("More detail needed", t("cancel.remarks_min_hint").replace("{count}", String(remarks.trim().length)));
      } else {
        Alert.alert("Could not cancel", e?.message ?? "Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="heading" weight="bold">{t("cancel.reason_title")}</Text>
            <Pressable onPress={onClose} disabled={busy} accessibilityLabel="Close">
              <Text variant="body" tone="muted">✕</Text>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: space.sm, paddingVertical: space.sm }}>
              {REASONS.map((r) => {
                const sel = selected === r.code;
                return (
                  <Pressable
                    key={r.code}
                    onPress={() => onSelect(r.code)}
                    disabled={busy}
                    style={[styles.reason, sel ? styles.reasonOn : null]}
                  >
                    <Text variant="body" weight={sel ? "bold" : "regular"} style={{ color: sel ? colors.textInverse : colors.textPrimary }}>
                      {t(`cancel.reason.${r.code}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {selected === "OTHER" ? (
              <View style={{ gap: space.xs, paddingBottom: space.sm }}>
                <Input
                  label=""
                  value={remarks}
                  onChangeText={setRemarks}
                  placeholder={t("cancel.other_remarks_placeholder")}
                  multiline
                />
                <Text variant="tiny" tone={remarksTooShort ? "danger" : "muted"}>
                  {t("cancel.remarks_min_hint").replace("{count}", String(remarks.trim().length))}
                </Text>
              </View>
            ) : null}

            {isPatientReason(selected) ? (
              <View style={styles.waitBox}>
                <Text variant="title" weight="bold" align="center" tone="primary">
                  {mmss(remaining ?? 0)}
                </Text>
                <Text variant="tiny" tone="secondary" align="center">
                  {t("cancel.wait_countdown_hint")}
                </Text>
                {patientPhone ? (
                  <Button
                    label={t("cancel.call_patient")}
                    variant="outline"
                    onPress={() => Linking.openURL(`tel:${patientPhone}`).catch(() => {})}
                    fullWidth
                  />
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <Button
            label={t("cancel.confirm_cancellation")}
            onPress={confirm}
            loading={busy}
            disabled={confirmDisabled}
            fullWidth
            size="lg"
            variant="primary"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    gap: space.md
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border
  },
  reason: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg
  },
  reasonOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  waitBox: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primaryFaint,
    marginBottom: space.sm
  }
});
