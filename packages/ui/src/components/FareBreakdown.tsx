import React, { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { Input } from "./Input";
import { colors, space } from "../tokens";

/**
 * v1.0.15 — extracted from BookAmbulanceScreen so the new PaymentScreen
 * (SOS post-completion) can render the same breakdown. Both consumers pass
 * the same `quote` shape (the `/fares/quote` response) and the coupon state
 * lives in the parent.
 *
 * Renders: distance line, multiplier rows (if non-1.0), subtotal, ETA,
 * coupon row when applied, and the bottom "Total payable" line. The coupon
 * input + "Apply" button when not applied. PILOT100 quick-apply link.
 */

export type FareQuoteForUi = {
  baseFareInr: number;
  perKmFareInr: number;
  distanceKm: number | null;
  distanceChargeInr: number;
  totalInr: number;
  etaMin: number | null;
  multipliers: {
    vehicleType: string;
    vehicleMult: number;
    emergencyType: string | null;
    emergencyMult: number;
    nightSurcharge: number;
    isNight: boolean;
  };
  coupon: { couponCode: string | null; discountInr: number; payableInr: number };
};

type Props = {
  quote: FareQuoteForUi | null;
  coupon: string;
  onCouponChange: (v: string) => void;
  couponApplied: boolean;
  onApply: () => void;
  onRemove: () => void;
  /** Suggested coupon for the quick-apply link. */
  pilotCoupon?: string;
  /** Hide the "Pin drop to see distance fare" hint (used by PaymentScreen
   *  where the drop is always known by the time we render). */
  hideDistanceHint?: boolean;
  /** Hide the ETA row (PaymentScreen shows it elsewhere or doesn't need it). */
  hideEta?: boolean;
};

function FareBreakdownInner({
  quote,
  coupon,
  onCouponChange,
  couponApplied,
  onApply,
  onRemove,
  pilotCoupon = "PILOT100",
  hideDistanceHint,
  hideEta
}: Props) {
  const distanceCharge = quote?.distanceChargeInr ?? 0;
  const totalBeforeDiscount = quote?.totalInr ?? 0;
  const discount = quote?.coupon?.discountInr ?? 0;
  const finalFare = quote?.coupon?.payableInr ?? totalBeforeDiscount;

  return (
    <View style={{ gap: space.sm }}>
      {quote && quote.distanceKm != null ? (
        <>
          <View style={styles.fareRow}>
            <Text variant="body" tone="secondary">
              Distance ({quote.distanceKm.toFixed(1)} km × ₹{quote.perKmFareInr})
            </Text>
            <Text variant="body" weight="semi">₹{distanceCharge}</Text>
          </View>
          {quote.multipliers.vehicleMult !== 1.0 ? (
            <View style={styles.fareRow}>
              <Text variant="body" tone="secondary">
                Vehicle ({quote.multipliers.vehicleType} × {quote.multipliers.vehicleMult.toFixed(2)})
              </Text>
              <Text variant="body" weight="semi">×{quote.multipliers.vehicleMult.toFixed(2)}</Text>
            </View>
          ) : null}
          {quote.multipliers.emergencyMult > 1.0 ? (
            <View style={styles.fareRow}>
              <Text variant="body" tone="secondary">Priority dispatch</Text>
              <Text variant="body" weight="semi">×{quote.multipliers.emergencyMult.toFixed(2)}</Text>
            </View>
          ) : null}
          {quote.multipliers.isNight ? (
            <View style={styles.fareRow}>
              <Text variant="body" tone="secondary">Night surcharge (10pm–6am)</Text>
              <Text variant="body" weight="semi">×{quote.multipliers.nightSurcharge.toFixed(2)}</Text>
            </View>
          ) : null}
          <View style={styles.fareRow}>
            <Text variant="body" tone="secondary">Subtotal</Text>
            <Text variant="body" weight="semi" style={couponApplied ? styles.struck : undefined}>
              ₹{totalBeforeDiscount}
            </Text>
          </View>
          {!hideEta && quote.etaMin != null ? (
            <View style={styles.fareRow}>
              <Text variant="tiny" tone="muted">⏱  Ambulance arrives in</Text>
              <Text variant="tiny" tone="muted">~{quote.etaMin} min</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.fareRow}>
          <Text variant="body" tone="secondary">Minimum fare estimate</Text>
          <Text variant="body" weight="semi">
            {quote ? `₹${quote.totalInr}` : <Text variant="body" tone="muted">…</Text>}
          </Text>
        </View>
      )}

      {!hideDistanceHint && (!quote || quote.distanceKm == null) ? (
        <Text variant="tiny" tone="muted">
          Pin a drop location to see the distance-based fare. Industry rates: ₹{quote?.perKmFareInr ?? 120}/km · minimum ₹{quote?.baseFareInr ?? 300}.
        </Text>
      ) : null}

      {couponApplied ? (
        <>
          <View style={styles.fareRow}>
            <Text variant="body" tone="success">Coupon {coupon}</Text>
            <Text variant="body" weight="semi" tone="success">− ₹{discount}</Text>
          </View>
          <View style={[styles.fareRow, styles.fareTotalRow]}>
            <Text variant="heading" weight="bold">Total payable</Text>
            <Text variant="heading" weight="bold" tone="success">₹{finalFare}</Text>
          </View>
          <Button label="Remove coupon" variant="ghost" onPress={onRemove} />
        </>
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Coupon code"
                value={coupon}
                onChangeText={onCouponChange}
                placeholder={pilotCoupon}
                autoCapitalize="characters"
              />
            </View>
            <Button label="Apply" onPress={onApply} variant="outline" />
          </View>
          <Pressable onPress={() => { onCouponChange(pilotCoupon); onApply(); }}>
            <Text variant="small" tone="primary" style={{ textDecorationLine: "underline" }}>
              Use launch offer: {pilotCoupon} (100% off)
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  fareTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.sm
  },
  struck: {
    textDecorationLine: "line-through",
    color: colors.textMuted
  }
});

export const FareBreakdown = memo(FareBreakdownInner);
