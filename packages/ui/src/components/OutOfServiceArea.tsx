import React, { memo } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { SUPPORT_PHONE } from "./ContactSupport";
import { colors, radius, space } from "../tokens";

/**
 * Shared out of service area sheet (built by Foundation, consumed by both the
 * normal booking flow and SOS).
 *
 * The backend authoritatively blocks any pickup beyond the service radius of
 * SRMS: POST /api/v1/bookings returns HTTP 403 with
 *   { error: "out_of_service_area", message, distanceKm, radiusKm }.
 * The app api() wrapper surfaces that as err.message === "out_of_service_area"
 * with the friendly text on err.details.message. Screens detect that case and
 * open this sheet instead of showing the raw error code.
 *
 * Like SafetyButton / AppDialog this is an app styled bottom sheet (tokens +
 * Text + Button), NOT a native popup. It lives inside an RN Modal that is
 * mounted only while `visible` is true, so it is fully non blocking when
 * closed: no overlay, no swallowed touches.
 *
 * Two layouts share one component:
 *   - emergency === true  (SOS): the call 108 fallback is hoisted ABOVE the
 *     explanation and shown as a prominent danger tinted card, because the user
 *     may need an ambulance right now.
 *   - emergency === false (booking): the explanation comes first and the call
 *     options sit below as a softer secondary fallback.
 */

type Props = {
  visible: boolean;
  onClose: () => void;
  cityName: string;
  hospitalName?: string;
  radiusKm?: number;
  emergency?: boolean;
};

function OutOfServiceAreaInner({
  visible,
  onClose,
  cityName,
  hospitalName,
  radiusKm,
  emergency = false
}: Props) {
  const call108 = () => {
    Linking.openURL("tel:108").catch(() => {});
  };
  const callSupport = () => {
    Linking.openURL("tel:" + SUPPORT_PHONE).catch(() => {});
  };

  const title = emergency ? "Outside our service area" : "We are not in your area yet";

  const radiusLine =
    radiusKm && hospitalName ? ", within " + radiusKm + " km of " + hospitalName : "";
  const explanation =
    "Jeevan Rakshak is currently live in " +
    cityName +
    " only" +
    radiusLine +
    ". We cannot dispatch an ambulance to your location yet.";

  // The emergency 108 card, hoisted to the top in SOS mode. In booking mode the
  // same two call options render lower down as a softer secondary block.
  const emergencyCard = (
    <View style={styles.emergencyCard}>
      <Text variant="label" tone="danger">EMERGENCY</Text>
      <Text variant="small" tone="secondary" style={styles.emergencyLine}>
        In an emergency, call 108 now
      </Text>
      <Button
        label="Call 108 (ambulance)"
        variant="danger"
        size="lg"
        onPress={call108}
        fullWidth
        style={styles.topGap}
      />
      <Button
        label="Call Jeevan Rakshak support"
        variant="outline"
        onPress={callSupport}
        fullWidth
        style={styles.smallGap}
      />
    </View>
  );

  // The softer secondary fallback shown under the explanation in booking mode.
  const secondaryCalls = (
    <View style={styles.secondaryBlock}>
      <Text variant="label" tone="secondary">NEED AN AMBULANCE NOW</Text>
      <Button
        label="Call 108 (ambulance)"
        variant="danger"
        onPress={call108}
        fullWidth
        style={styles.topGap}
      />
      <Button
        label="Call Jeevan Rakshak support"
        variant="outline"
        onPress={callSupport}
        fullWidth
        style={styles.smallGap}
      />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <Text variant="heading" weight="bold">{title}</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" hitSlop={10}>
              <Text variant="heading" tone="secondary">✕</Text>
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {emergency ? (
              <>
                {emergencyCard}
                <Text variant="body" tone="secondary">{explanation}</Text>
              </>
            ) : (
              <>
                <Text variant="body" tone="secondary">{explanation}</Text>
                {secondaryCalls}
              </>
            )}

            <Button label="Close" variant="primary" onPress={onClose} fullWidth style={styles.closeGap} />
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
    alignItems: "center",
    marginBottom: space.md
  },
  body: {
    gap: space.md,
    paddingBottom: space.lg
  },
  emergencyCard: {
    backgroundColor: colors.primaryFaint,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: space.md
  },
  emergencyLine: {
    marginTop: space.xs
  },
  secondaryBlock: {
    backgroundColor: colors.bg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md
  },
  topGap: { marginTop: space.md },
  smallGap: { marginTop: space.sm },
  closeGap: { marginTop: space.xs }
});

export const OutOfServiceArea = memo(OutOfServiceAreaInner);
