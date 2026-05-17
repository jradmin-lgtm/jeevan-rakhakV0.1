import React, { memo } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { colors, radius, space } from "../tokens";

/**
 * Live support coordinates for the pilot. Inline so any screen can drop
 * <ContactSupport /> in without re-typing the email/phone or risking drift.
 *
 * Updated in v1.0.12 per team feedback: three numbers, one is GYNAE-only.
 * The default-dial number (driver `Need help?` + patient compact call)
 * is the landline 05812582000 — that's the ops desk that can route
 * across the rotation.
 */
export const SUPPORT_EMAIL = "contact.jeevanrakshak@gmail.com";
export const SUPPORT_PHONE = "+910581258200"; // 05812582000 — ops desk landline (default call)
export const SUPPORT_PHONE_DISPLAY = "0581 258 2000";

export const SUPPORT_NUMBERS = [
  { label: "Ops desk", phone: "+910581258200", display: "0581 258 2000", primary: true },
  { label: "Mobile",   phone: "+919458701070", display: "94587 01070" },
  { label: "Gynae emergency", phone: "+919045954724", display: "90459 54724", urgent: true }
];

type Props = {
  /**
   * Optional booking id appended to the mailto subject so support can
   * pull the right record without asking.
   */
  bookingId?: string;
  compact?: boolean;
  /**
   * Driver app only needs one Call button (defaults to the ops desk).
   * User app shows the full list with GYNAE labelled. Default: full list.
   */
  variant?: "user" | "driver";
};

function ContactSupportInner({ bookingId, compact, variant = "user" }: Props) {
  const subject = bookingId
    ? `Help with booking ${bookingId.slice(0, 8)}`
    : "Help — Jeevan Rakshak";

  const callDefault = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {});
  };
  const callNumber = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {});
  };
  const emailSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`).catch(() => {});
  };

  // Compact = single Call + Email row used inside the "Need help" banner
  // during an active trip. Both apps share this layout; the call icon
  // always dials the ops desk default regardless of variant.
  if (compact) {
    return (
      <View style={styles.compactRow}>
        <Pressable onPress={callDefault} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.compactCta}>
          <Text variant="small" weight="bold" tone="primary">📞  Call ops</Text>
        </Pressable>
        <Pressable onPress={emailSupport} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.compactCta}>
          <Text variant="small" weight="bold" tone="primary">✉  Email</Text>
        </Pressable>
      </View>
    );
  }

  // Full card. Driver app keeps the original 2-button row (single
  // primary call). User app gets a stacked list of three buttons so the
  // GYNAE emergency line is one tap away from Home.
  if (variant === "driver") {
    return (
      <View style={styles.card}>
        <Text variant="label" tone="secondary">CONTACT SUPPORT</Text>
        <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
          Available daily, 8 AM – 11 PM IST.
        </Text>
        <View style={styles.row}>
          <Pressable onPress={callDefault} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.cta}>
            <Text variant="body" weight="bold" tone="primary">📞  Call ops</Text>
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

  // user variant
  return (
    <View style={styles.card}>
      <Text variant="label" tone="secondary">CONTACT SUPPORT</Text>
      <Text variant="small" tone="secondary" style={{ marginTop: 2 }}>
        Available daily, 8 AM – 11 PM IST.
      </Text>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {SUPPORT_NUMBERS.map((n) => (
          <Pressable
            key={n.phone}
            onPress={() => callNumber(n.phone)}
            android_ripple={{ color: "rgba(229,50,43,0.1)" }}
            style={[styles.stackedCta, n.urgent ? styles.stackedCtaUrgent : null]}
          >
            <View style={{ flex: 1 }}>
              <Text variant="body" weight="bold" tone={n.urgent ? "danger" : "primary"}>
                {n.urgent ? "🚨  " : "📞  "}{n.label}
              </Text>
              <Text variant="tiny" tone="secondary">{n.display}</Text>
            </View>
            <Text variant="small" weight="bold" tone={n.urgent ? "danger" : "primary"}>Call ›</Text>
          </Pressable>
        ))}
        <Pressable onPress={emailSupport} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.stackedCta}>
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="bold" tone="primary">✉  Email</Text>
            <Text variant="tiny" tone="secondary">{SUPPORT_EMAIL}</Text>
          </View>
          <Text variant="small" weight="bold" tone="primary">Open ›</Text>
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
  stackedCta: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg
  },
  stackedCtaUrgent: {
    borderColor: colors.danger,
    backgroundColor: "#FEF2F2"
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
