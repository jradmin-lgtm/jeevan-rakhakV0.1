import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { Button, IconBadge, PulseDot, Text, colors, radius, space } from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { getSocket } from "../socket";

type SosPayload = {
  bookingId: string;
  emergencyType: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  distanceKm: number;
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
 * Big red pulse + ACCEPT / REJECT. Accept races on the server side via the
 * existing `POST /bookings/:id/accept` atomic update; on 409 the modal
 * tells the driver "Another driver took it" and dismisses. Reject calls
 * `POST /bookings/:id/reject` which writes to `sos_dispatch_attempts` so
 * the next wave skips this driver.
 */
export function SosIncomingModal({ onAccept }: Props) {
  const [active, setActive] = useState<SosPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;

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
          // Ignore subsequent pushes for the same booking — the modal already
          // displays it.
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
      } catch {
        /* socket bootstrap failed — Dashboard will retry on next refresh */
      }
    })();
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, []);

  // Slow breathing pulse on the modal CTA whenever it's visible.
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.08, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

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
        Alert.alert("Already taken", "Another driver accepted this SOS.");
      } else {
        Alert.alert("Couldn't accept", e?.message ?? "Try again.");
      }
      setActive(null);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!active || busy) return;
    setBusy(true);
    try {
      await bookingsApi.reject(active.bookingId);
    } catch {
      /* swallow — the modal still dismisses so the UI stays responsive */
    } finally {
      setActive(null);
      setBusy(false);
    }
  };

  if (!active) return null;

  const etaMin = Math.max(1, Math.round((active.distanceKm * 1.4) / 28 * 60));

  return (
    <Modal visible animationType="fade" transparent onRequestClose={reject}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={{ alignItems: "center", gap: space.sm }}>
            <Animated.View style={{ transform: [{ scale: pulse }] }}>
              <PulseDot size={88} color={colors.danger} rings={3} />
            </Animated.View>
            <Text variant="label" tone="danger" weight="bold" style={{ letterSpacing: 1 }}>
              EMERGENCY SOS
            </Text>
            <Text variant="title" weight="bold" align="center">
              {prettyEmergency(active.emergencyType)}
            </Text>
            <View style={styles.metaRow}>
              <IconBadge glyph="↗" bg={colors.primaryFaint} color={colors.primary} size={32} />
              <View style={{ flex: 1 }}>
                <Text variant="small" tone="secondary">DISTANCE</Text>
                <Text variant="body" weight="semi">{active.distanceKm.toFixed(1)} km away</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="small" tone="secondary">ETA</Text>
                <Text variant="body" weight="semi">~{etaMin} min</Text>
              </View>
            </View>
            {active.pickupAddress ? (
              <View style={styles.pickupRow}>
                <Text variant="tiny" tone="secondary">PICKUP</Text>
                <Text variant="small" weight="semi" align="center">{active.pickupAddress}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.buttonRow}>
            <Pressable
              onPress={reject}
              disabled={busy}
              android_ripple={{ color: "rgba(0,0,0,0.05)" }}
              style={[styles.btn, styles.btnReject, busy && { opacity: 0.6 }]}
            >
              <Text variant="body" weight="bold" tone="secondary">Reject</Text>
            </Pressable>
            <Pressable
              onPress={accept}
              disabled={busy}
              android_ripple={{ color: "rgba(255,255,255,0.2)" }}
              style={[styles.btn, styles.btnAccept, busy && { opacity: 0.6 }]}
            >
              <Text variant="body" weight="bold" style={{ color: "#fff" }}>
                {busy ? "Accepting…" : "ACCEPT"}
              </Text>
            </Pressable>
          </View>
          <Text variant="tiny" tone="muted" align="center">
            Wave {active.waveNumber} · auto-expanding every 60s
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function prettyEmergency(t: string): string {
  // Mirrors prettyEmergency in user-app/screens/HomeScreen.tsx without
  // importing across apps.
  const map: Record<string, string> = {
    CARDIAC: "Cardiac",
    ACCIDENT_TRAUMA: "Accident / Trauma",
    BREATHING_DISTRESS: "Breathing distress",
    PREGNANCY_NEONATAL: "Pregnancy / neonatal",
    GENERAL_CRITICAL_TRANSFER: "Critical transfer"
  };
  return map[t] ?? t;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    paddingHorizontal: space.lg
  },
  card: {
    backgroundColor: colors.surface,
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
    gap: space.xs,
    alignItems: "center"
  },
  buttonRow: {
    flexDirection: "row",
    gap: space.md
  },
  btn: {
    flex: 1,
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
