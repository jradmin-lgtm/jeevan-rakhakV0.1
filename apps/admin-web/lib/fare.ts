/**
 * v1.0.13: centralised "what does this booking actually pay?" resolver.
 *
 * Until v1.0.12 every list/detail/dashboard view had its own ad-hoc fare cell
 * (`fareFinalInr ?? fareEstimateInr`) — none of them honoured the admin fare
 * override, so a booking explicitly overridden to ₹125 still rendered as ₹500
 * everywhere on the admin web. This helper is the one place that resolves
 * the displayed amount; every cell now reads from it.
 *
 * Priority (highest wins):
 *   1. `adminFareOverrideInr` — admin typed a value explicitly (off-app
 *      billing, hospital invoices, ops adjustment). Treat this as truth.
 *   2. `payableInr` — what the patient actually paid through the app after
 *      coupon discount (server-side computed at booking create / close).
 *   3. `fareFinalInr - discountInr` — trip closed but payable wasn't
 *      populated (legacy bookings from v1.0.10 and earlier).
 *   4. `fareEstimateInr - discountInr` — rough projection if the trip
 *      hasn't closed and we don't have a final yet.
 *   5. `null` — nothing known.
 */
export type FareLikeBooking = {
  adminFareOverrideInr?: number | null;
  payableInr?: number | null;
  fareFinalInr?: number | null;
  fareEstimateInr?: number | null;
  discountInr?: number | null;
  couponCode?: string | null;
};

export type ResolvedAmount = {
  amount: number | null;
  source: "override" | "payable" | "final" | "estimate" | "none";
  /** True when the admin override is the chosen source. UI can flag it. */
  overridden: boolean;
};

export function resolveAmountPaid(b: FareLikeBooking): ResolvedAmount {
  if (b.adminFareOverrideInr != null) {
    return { amount: b.adminFareOverrideInr, source: "override", overridden: true };
  }
  if (b.payableInr != null) {
    return { amount: b.payableInr, source: "payable", overridden: false };
  }
  const discount = b.discountInr ?? 0;
  if (b.fareFinalInr != null) {
    return { amount: Math.max(0, b.fareFinalInr - discount), source: "final", overridden: false };
  }
  if (b.fareEstimateInr != null) {
    return { amount: Math.max(0, b.fareEstimateInr - discount), source: "estimate", overridden: false };
  }
  return { amount: null, source: "none", overridden: false };
}

/** Convenience formatter for list cells. */
export function formatAmountPaid(b: FareLikeBooking): string {
  const r = resolveAmountPaid(b);
  return r.amount == null ? "—" : `₹${r.amount}`;
}
