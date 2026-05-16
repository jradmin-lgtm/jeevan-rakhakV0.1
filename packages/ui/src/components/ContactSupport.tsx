import React, { memo } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

/**
 * Live support coordinates for the pilot. Inline so any screen can drop
 * <ContactSupport /> in without re-typing the email/phone or risking drift.
 */
export const SUPPORT_EMAIL = "contact.jeevanrakshak@gmail.com";
export const SUPPORT_PHONE = "+918630458367"; // "863 045 8367" — Indian landline / mobile, no spaces for tel: URL
export const SUPPORT_PHONE_DISPLAY = "863 045 8367";

type Props = {
  /**
   * Optional booking id appended to the mailto subject so support can
   * pull the right record without asking.
   */
  bookingId?: string;
  compact?: boolean;
};

function ContactSupportInner({ bookingId, compact }: Props) {
  const subject = bookingId
    ? `Help with booking ${bookingId.slice(0, 8)}`
    : "Help — Jeevan Rakshak";

  const callSupport = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {});
  };
  const emailSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`).catch(() => {});
  };

  if (compact) {
    return (
      <View style={styles.compactRow}>
        <Pressable onPress={callSupport} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.compactCta}>
          <Text variant="small" weight="bold" tone="primary">📞  Call</Text>
        </Pressable>
        <Pressable onPress={emailSupport} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.compactCta}>
          <Text variant="small" weight="bold" tone="primary">✉  Email</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text variant="label" tone="secondary">CONTACT SUPPORT</Text>
      <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
        Available daily, 8 AM – 11 PM IST.
      </Text>
      <View style={styles.row}>
        <Pressable onPress={callSupport} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.cta}>
          <Text variant="body" weight="bold" tone="primary">📞  Call us</Text>
          <Text variant="tiny" tone="secondary">{SUPPORT_PHONE_DISPLAY}</Text>
        </Pressable>
        <Pressable onPress={emailSupport} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.cta}>
          <Text variant="body" weight="bold" tone="primary">✉  Email</Text>
          <Text variant="tiny" tone="secondary">{SUPPORT_EMAIL}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  row: {
    flexDirection: "row",
    gap: space.sm,
    marginTop: space.sm
  },
  cta: {
    flex: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center"
  },
  compactRow: { flexDirection: "row", gap: space.sm },
  compactCta: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryFaint
  }
});

export const ContactSupport = memo(ContactSupportInner);
