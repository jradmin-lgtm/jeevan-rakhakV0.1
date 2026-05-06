import React, { useEffect, useRef, useState } from "react";
import { Alert, Animated, Pressable, StyleSheet, View } from "react-native";
import { AppHeader, Button, Card, IconBadge, PulseDot, Screen, Text, colors, space } from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";

const PICKUP = { lat: 28.6139, lng: 77.209 };

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
              const r = await bookingsApi.create({
                emergencyType: "CARDIAC",
                pickupLat: PICKUP.lat,
                pickupLng: PICKUP.lng,
                pickupAddress: "SOS · current location"
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
    <Screen bg={colors.danger} padding={0}>
      <View style={styles.headerWrap}>
        <AppHeader title="" onBack={onBack} />
      </View>

      <View style={styles.content}>
        <View style={styles.ringWrap}>
          <PulseDot size={140} color="#FFFFFF" rings={3} />
          <Animated.View style={[styles.bigButton, { transform: [{ scale: breathe }] }]}>
            <Pressable
              onPress={dispatch}
              android_ripple={{ color: "rgba(255,255,255,0.2)", borderless: true }}
              style={styles.bigButtonInner}
              disabled={busy}
            >
              <Text variant="title" tone="inverse" weight="bold" style={{ fontSize: 40 }}>SOS</Text>
              <Text variant="small" tone="inverse" style={{ opacity: 0.9 }}>Tap to dispatch</Text>
            </Pressable>
          </Animated.View>
        </View>

        <Card style={{ backgroundColor: "rgba(255,255,255,0.95)" }}>
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <IconBadge glyph="!" bg="#FEE2E2" color={colors.danger} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="body" weight="semi">For life-threatening emergencies</Text>
                <Text variant="small" tone="secondary">Highest dispatch priority. Misuse may suspend your account.</Text>
              </View>
            </View>
            <Button label="Cancel and go back" variant="outline" onPress={onBack} fullWidth />
            {busy ? <Text variant="small" tone="secondary" align="center">Sending SOS…</Text> : null}
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { paddingHorizontal: space.lg, paddingTop: space.lg },
  content: { flex: 1, padding: space.lg, gap: space.xl, alignItems: "center", justifyContent: "center" },
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
  }
});
