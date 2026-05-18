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
// Phone numbers stored in full E.164-ish form (+91 + 10 or 11-digit subscriber).
// The dialable string must match the displayed number exactly when normalised,
// or the user will tap a row and get a wrong-number tone. A 2026-05 audit caught
// a typo in the Ops desk number: +910581258200 was 12 digits (missing trailing
// 0); the actual landline is 05812582000 → +9105812582000.
//
// Display format conventions:
//   • Mobile (10 digits, starts with 6/7/8/9): "+91 9XXXX XXXXX" (5+5 + country code prefix)
//   • Landline (10–11 digits, starts with 0X…): "+91 XXX XXX XXXX" — STD code regrouped
// Both prefix +91 so the visual aligns column-wise.
export const SUPPORT_EMAIL = "contact.jeevanrakshak@gmail.com";
export const SUPPORT_PHONE = "+9105812582000"; // 0581-258-2000 — ops desk landline (default call)
export const SUPPORT_PHONE_DISPLAY = "+91 581 258 2000";

// v1.0.14 (revised): labels uppercased for the cleaner directory look the
// team asked for. The urgent row carries an explicit "EMERGENCY" suffix
// so even users skimming see the priority.
export const SUPPORT_NUMBERS = [
  { label: "OPS DESK",        phone: "+9105812582000", display: "+91 581 258 2000", primary: true },
  { label: "MOBILE",          phone: "+919458701070",  display: "+91 94587 01070" },
  { label: "GYNAE EMERGENCY", phone: "+919045954724",  display: "+91 90459 54724", urgent: true }
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
              <Text variant="body" weight="bold" tone={n.urgent ? "danger" : "primary"} style={{ letterSpacing: 0.4 }}>
                {n.label}
              </Text>
              <Text variant="tiny" tone="secondary">{n.display}</Text>
            </View>
            {/* v1.0.14 (revised): replaced "Call ›" text with a circular
              * filled icon button. Brand-coloured (red) on urgent rows,
              * accent-coloured on the rest. Tap area = full row Pressable
              * above, the icon is decorative + a visual affordance. */}
            <View style={[styles.iconBtn, n.urgent ? styles.iconBtnUrgent : styles.iconBtnPrimary]}>
              <Text style={styles.iconGlyph}>📞</Text>
            </View>
          </Pressable>
        ))}
        <Pressable onPress={emailSupport} android_ripple={{ color: "rgba(229,50,43,0.1)" }} style={styles.stackedCta}>
          <View style={{ flex: 1 }}>
            <Text variant="body" weight="bold" tone="primary" style={{ letterSpacing: 0.4 }}>EMAIL</Text>
            <Text variant="tiny" tone="secondary">{SUPPORT_EMAIL}</Text>
          </View>
          <View style={[styles.iconBtn, styles.iconBtnPrimary]}>
            <Text style={styles.iconGlyph}>✉</Text>
          </View>
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
  // v1.0.14: softened. The previous "full danger-red border + pink fill" made
  // GYNAE look like a selected/active state instead of just "important". Now
  // we keep the same neutral card chrome as the other rows, but accent the
  // left edge in red + use the danger text colour on the label. Subtle.
  stackedCtaUrgent: {
    borderLeftWidth: 4,
    borderLeftColor: colors.danger
  },
  // v1.0.14: round filled call/email icon buttons. Used inside each
  // SUPPORT_NUMBERS row + the email row. 44dp matches the minimum touch
  // target Material spec recommends; the icon is centred via flex.
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center"
  },
  iconBtnPrimary: { backgroundColor: colors.primary },
  iconBtnUrgent: { backgroundColor: colors.danger },
  iconGlyph: { fontSize: 20, color: "#fff", lineHeight: 22 },
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
