import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, colors, dialog, radius, space } from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { getSocket } from "../socket";
import { useT } from "../i18n";
import { LangToggle } from "./LangToggle";

type SosPayload = {
  bookingId: string;
  emergencyType: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  pickupLandmark?: string | null;
  distanceKm: number | null;
  waveNumber: number;
};

type Props = {
  // Called when the driver accepts (after the server confirms). Parent routes
  // to TripScreen with the booking. If the request was already taken by
  // another driver (409), the modal dismisses with an alert instead.
  onAccept: (booking: Booking) => void;
};

/**
 * v1.0.15 — full-screen modal that pops over Dashboard whenever the SOS
 * cascade engine pushes this driver. Listens on the shared socket for
 * `sos:incoming` (show) and `sos:cancelled` (dismiss — another driver won
 * or the patient cancelled).
 *
 * Big red pulse + ACCEPT / DISMISS. Accept races on the server side via the
 * existing `POST /bookings/:id/accept` atomic update; on 409 the modal tells
 * the driver "Another driver took it" and closes.
 *
 * v1.2.7: the flash's secondary action is a SOFT **Dismiss**, NOT a reject.
 * It only closes the full-screen overlay (and remembers the id so the flash
 * won't re-pop) — it does NOT call /reject. The SOS stays REQUESTED and keeps
 * sitting in the driver's Incoming Requests list as a SECOND CHANCE to accept,
 * so a stray tap on a full-screen alert can't drop a live emergency. A true
 * decline is the confirm-gated Reject inside that list (which writes
 * sos_dispatch_attempts so the cascade skips this driver).
 */
export function SosIncomingModal({ onAccept }: Props) {
  const { t } = useT();
  const [active, setActive] = useState<SosPayload | null>(null);
  const [busy, setBusy] = useState(false);
  // Bookings the driver dismissed from the FLASH — keeps the overlay from
  // re-popping for them while they still live in the Incoming Requests list.
  const dismissed = useRef<Set<string>>(new Set());

  // Subscribe once on mount; stays active for the screen lifetime.
  useEffect(() => {
    let mounted = true;
    let cleanup: (() => void) | null = null;
    (async () => {
      try {
        const sock = await getSocket();
        if (!mounted) return;
        const onIncoming = (p: SosPayload) => {
          if (!mounted) return;
          // Dismissed-from-flash → it lives in the Incoming Requests list now;
          // don't re-pop the overlay. Otherwise show it (ignore dup pushes for
          // the booking already displayed).
          if (dismissed.current.has(p.bookingId)) return;
          setActive((prev) => (prev?.bookingId === p.bookingId ? prev : p));
        };
        const onCancelled = (p: { bookingId: string }) => {
          if (!mounted) return;
          setActive((prev) => (prev?.bookingId === p.bookingId ? null : prev));
        };
        sock.on("sos:incoming", onIncoming);
        sock.on("sos:cancelled", onCancelled);
        cleanup = () => {
          sock.off("sos:incoming", onIncoming);
          sock.off("sos:cancelled", onCancelled);
        };
      } catch (error) { console.warn("SosIncomingModal.tsx.SosIncomingModal failed", error instanceof Error ? error.message : String(error)); }
    })();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  // v1.1.0 (CR#4): polling fallback. The socket `sos:incoming` push is
  // best-effort and silently fails when the socket-server is cold (Render
  // free-tier) — the #1 reason SOS never reached drivers. Poll the server
  // every 8s for any SOS pushed to this driver and surface the nearest one if
  // the modal isn't already showing it. Cheap; stops the moment one is shown.
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const r = await bookingsApi.sosPending();
        if (!mounted || !r.sos?.length) return;
        // Surface the nearest SOS the driver hasn't dismissed from the flash.
        const next = r.sos.find((s) => !dismissed.current.has(s.bookingId));
        if (!next) return;
        setActive((prev) =>
          prev
            ? prev
            : {
                bookingId: next.bookingId,
                emergencyType: next.emergencyType,
                pickupLat: next.pickupLat,
                pickupLng: next.pickupLng,
                pickupAddress: next.pickupAddress,
                pickupLandmark: next.pickupLandmark,
                distanceKm: next.distanceKm,
                waveNumber: next.waveNumber
              }
        );
      } catch (error) { console.warn("SosIncomingModal.tsx.poll failed", error instanceof Error ? error.message : String(error)); }
    };
    void poll();
    const id = setInterval(poll, 8000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const accept = async () => {
    if (!active || busy) return;
    setBusy(true);
    try {
      const r = await bookingsApi.accept(active.bookingId);
      setActive(null);
      onAccept(r.booking);
    } catch (e: any) {
      // Race-loss → server returns 409 "already_taken". Dismiss with a
      // gentle notice so the driver knows the SOS isn't for them anymore.
      const msg = String(e?.message ?? "").toLowerCase();
      if (msg.includes("already_taken") || msg.includes("409")) {
        void dialog.alert(t("sos_modal.already_taken_title"), t("sos_modal.already_taken_body"));
      } else {
        void dialog.alert(t("sos_modal.accept_error_title"), e?.message ?? t("sos_modal.accept_error_body"));
      }
      setActive(null);
    } finally {
      setBusy(false);
    }
  };

  // SOFT dismiss — close the overlay only. Does NOT reject the SOS: the request
  // stays REQUESTED and keeps sitting in the Incoming Requests list as a second
  // chance to accept. (A true decline is the confirm-gated Reject in that list.)
  const dismiss = () => {
    if (!active || busy) return;
    dismissed.current.add(active.bookingId);
    setActive(null);
  };

  if (!active) return null;

  const distance = active.distanceKm != null && Number.isFinite(active.distanceKm) ? active.distanceKm : null;
  const etaMin = distance == null ? null : Math.max(1, Math.round((distance * 1.4) / 28 * 60));

  return (
    <Modal visible animationType="fade" transparent onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.sosBadge}><Text weight="bold" tone="inverse">SOS</Text></View>
            <View style={{ flex: 1 }}>
              <Text variant="tiny" tone="danger" weight="bold">{t("sos_modal.headline")}</Text>
              <Text variant="heading" weight="bold">{prettyEmergency(active.emergencyType, t)}</Text>
            </View>
            <LangToggle />
          </View>
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: space.lg }}>
            <View style={styles.metaRow}>
              <View style={{ flex: 1 }}>
                <Text variant="tiny" tone="secondary">{t("sos_modal.distance_label")}</Text>
                <Text variant="heading" weight="semi">{distance == null ? t("sos_modal.unavailable") : t("sos_modal.distance_value").replace("{km}", distance.toFixed(1))}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="tiny" tone="secondary">{t("sos_modal.eta_label")}</Text>
                <Text variant="heading" weight="semi">{etaMin == null ? t("sos_modal.unavailable") : t("sos_modal.eta_value").replace("{min}", String(etaMin))}</Text>
              </View>
            </View>
            {active.pickupLandmark ? <View style={styles.landmarkRow}>
              <Text variant="tiny" tone="secondary">{t("trip.landmark")}</Text>
              <Text variant="heading" weight="bold">{active.pickupLandmark}</Text>
            </View> : null}
            <View style={styles.pickupRow}>
              <Text variant="tiny" tone="secondary">{t("map_picker.selected_pickup")}</Text>
              <Text variant="body" weight="semi">{active.pickupAddress || t("trip.landmark_unavailable")}</Text>
            </View>
          </ScrollView>
          <View style={styles.buttonRow}>
            <Pressable
              accessibilityRole="button"
              onPress={dismiss}
              disabled={busy}
              android_ripple={{ color: "rgba(0,0,0,0.05)" }}
              style={[styles.btn, styles.btnReject, busy && { opacity: 0.6 }]}
            >
              <Text variant="body" weight="bold" tone="secondary">{t("sos_modal.dismiss")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={accept}
              disabled={busy}
              android_ripple={{ color: "rgba(255,255,255,0.2)" }}
              style={[styles.btn, styles.btnAccept, busy && { opacity: 0.6 }]}
            >
              <Text variant="body" weight="bold" style={{ color: "#fff" }}>
                {busy ? t("sos_modal.accepting") : t("sos_modal.accept")}
              </Text>
            </Pressable>
          </View>
          <Text variant="tiny" tone="muted" align="center">
            {t("sos_modal.wave_label").replace("{n}", String(active.waveNumber))}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

// CR4 (2026-08): localized. Kept as a LOCAL duplicate (not imported from
// DashboardScreen.tsx) deliberately — DashboardScreen already imports THIS
// file (to render the modal), so importing back would be a circular import.
function prettyEmergency(emergencyType: string, translate: (key: string) => string): string {
  const map: Record<string, string> = {
    CARDIAC: translate("emergency.cardiac"),
    ACCIDENT_TRAUMA: translate("emergency.accident_trauma"),
    BREATHING_DISTRESS: translate("emergency.breathing_distress"),
    PREGNANCY_NEONATAL: translate("emergency.pregnancy_neonatal"),
    GENERAL_CRITICAL_TRANSFER: translate("emergency.critical_transfer")
  };
  return map[emergencyType] ?? emergencyType;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.xl
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sosBadge: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.danger, alignItems: "center", justifyContent: "center" },
  landmarkRow: { padding: space.md, backgroundColor: colors.bg, borderRadius: radius.md, gap: space.xs },
  card: {
    maxHeight: "90%",    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.lg,
    borderTopWidth: 4,
    borderTopColor: colors.danger,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    width: "100%",
    paddingTop: space.sm
  },
  pickupRow: {
    width: "100%",
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: space.xs
  },
  buttonRow: {
    flexDirection: "row",
    gap: space.md
  },
  btn: {
    flex: 1,
    minHeight: 56,
    paddingVertical: space.md,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center"
  },
  btnReject: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border
  },
  btnAccept: {
    backgroundColor: colors.danger
  }
});
