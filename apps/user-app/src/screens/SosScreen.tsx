import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Linking, Pressable, StyleSheet, View } from "react-native";
import * as Location from "expo-location";
import { AppHeader, Button, Card, IconBadge, PulseDot, Screen, Text, colors, space } from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from "@jr/ui";

// v1.0.12: removed the Delhi-centroid fallback for SOS. Sending an
// ambulance to the wrong city is worse than refusing to send one — if GPS
// is unavailable we now show an alert pointing the user at the support
// mobile number so they can book over the phone.
async function getPickup(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return null;
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: fix.coords.latitude, lng: fix.coords.longitude };
  } catch {
    try {
      const last = await Location.getLastKnownPositionAsync();
      if (last) return { lat: last.coords.latitude, lng: last.coords.longitude };
    } catch {
      /* ignored */
    }
    return null;
  }
}

export function SosScreen({ onBack, onBooked }: { onBack: () => void; onBooked: (b: Booking) => void }) {
  const [busy, setBusy] = useState(false);
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 900, useNativeDriver: true })
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const dispatch = () => {
    Alert.alert(
      "Send SOS now?",
      "We'll dispatch the closest ambulance with cardiac priority.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send SOS",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const pickup = await getPickup();
              if (!pickup) {
                Alert.alert(
                  "Location unavailable",
                  `We can't send an ambulance without your location. Allow location access and try again, or call our mobile ${SUPPORT_PHONE_DISPLAY} to book by phone.`,
                  [
                    { text: "Allow location", onPress: () => Linking.openSettings().catch(() => {}) },
                    { text: `Call ${SUPPORT_PHONE_DISPLAY}`, onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}) },
                    { text: "Cancel", style: "cancel" }
                  ]
                );
                return;
              }
              const r = await bookingsApi.create({
                emergencyType: "CARDIAC",
                pickupLat: pickup.lat,
                pickupLng: pickup.lng,
                pickupAddress: "SOS · current location",
                // v1.0.15: routes the booking through the cascade engine on
                // server-side. Without this the server falls back to the
                // normal broadcast pool and SOS becomes a regular booking.
                isSos: true
              });
              onBooked(r.booking);
            } catch (e: any) {
              Alert.alert("SOS failed", e?.message ?? "Please try again.");
            } finally {
              setBusy(false);
            }
          }
        }
      ]
    );
  };

  return (
    <Screen bg={colors.danger} padding={0} scroll={false}>
      <View style={styles.headerWrap}>
        <AppHeader title="" onBack={onBack} />
      </View>

      <View style={styles.content}>
        <View style={styles.headlineWrap}>
          <Text variant="title" tone="inverse" weight="bold" align="center">
            Emergency SOS
          </Text>
          <Text variant="body" tone="inverse" align="center" style={{ opacity: 0.92 }}>
            Hold the button below to dispatch the nearest ambulance immediately.
          </Text>
        </View>

        <View style={styles.ringWrap}>
          <PulseDot size={140} color="#FFFFFF" rings={3} />
          <Animated.View style={[styles.bigButton, { transform: [{ scale: breathe }] }]}>
            <Pressable
              onPress={dispatch}
              android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
              style={styles.bigButtonInner}
              disabled={busy}
            >
              <Text
                variant="title"
                tone="inverse"
                weight="bold"
                style={{ fontSize: 48, letterSpacing: 1, textAlign: "center" }}
              >
                SOS
              </Text>
              <Text variant="small" tone="inverse" style={{ opacity: 0.92, marginTop: 4 }}>
                Tap to dispatch
              </Text>
            </Pressable>
          </Animated.View>
        </View>

        <Card style={styles.infoCard}>
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
              <IconBadge glyph="!" bg="#FEE2E2" color={colors.danger} size={44} />
              <View style={{ flex: 1 }}>
                <Text variant="heading" weight="semi">For life-threatening emergencies</Text>
                <Text variant="small" tone="secondary" style={{ marginTop: 4 }}>
                  This sends a high-priority cardiac dispatch. Misuse may suspend your account.
                </Text>
              </View>
            </View>
            <Button label="Cancel and go back" variant="outline" onPress={onBack} fullWidth />
            {busy ? (
              <Text variant="small" tone="secondary" align="center">Sending SOS…</Text>
            ) : null}
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: space.lg, paddingTop: space.lg },
  content: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.lg,
    alignItems: "center",
    justifyContent: "space-between"
  },
  headlineWrap: { gap: space.sm, paddingHorizontal: space.md, alignItems: "center" },
  ringWrap: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  bigButton: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.3)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6
  },
  bigButtonInner: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center"
  },
  infoCard: {
    backgroundColor: "#FFFFFF",
    width: "100%"
  }
});
