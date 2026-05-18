import React, { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, View } from "react-native";
import {
  AppHeader,
  Button,
  Card,
  FareBreakdown,
  FareQuoteForUi,
  Screen,
  Text,
  colors,
  space
} from "@jr/ui";
import { Booking, bookings as bookingsApi, fares as faresApi } from "../api";
import { useT } from "../i18n";

const PILOT_COUPON = "PILOT100";

type Props = {
  booking: Booking;
  /** Called once the user successfully marks the trip paid. Parent typically
   *  routes to RatingScreen, then to History. */
  onPaid: (booking: Booking) => void;
};

/**
 * v1.0.15 — post-completion payment for SOS rides.
 *
 * Triggered by LiveTrackingScreen when the booking transitions to COMPLETED
 * with `isSos = true` and `paidAt = null`. Patient sees the fare breakdown,
 * applies a coupon (PILOT100 → ₹0 in pilot), and taps "Mark paid · finish".
 *
 * Idempotent on the server side: a second mark-paid call returns the
 * existing payment. The screen also disables the Android back button so the
 * patient can't escape without finishing. App force-kill is safe — LiveTracking
 * re-routes back here on next launch because `paidAt` is still NULL.
 */
export function PaymentScreen({ booking: initial, onPaid }: Props) {
  const { t } = useT();
  const [booking, setBooking] = useState<Booking>(initial);
  const [quote, setQuote] = useState<FareQuoteForUi | null>(null);
  const [coupon, setCoupon] = useState<string>(initial.couponCode ?? "");
  const [couponApplied, setCouponApplied] = useState<boolean>(!!initial.couponCode);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Disable Android hardware back — payment is mandatory before the trip is
  // logged. Force-quit is the only escape and we recover on relaunch via the
  // status-check in LiveTrackingScreen.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  // Re-fetch the booking on mount so we have the freshest fare numbers even
  // if the screen was opened via deep link or push.
  useEffect(() => {
    let cancelled = false;
    bookingsApi
      .get(initial.id)
      .then((r) => { if (!cancelled) setBooking(r.booking); })
      .catch(() => { /* stale data is fine; next refresh tick will retry */ });
    return () => { cancelled = true; };
  }, [initial.id]);

  // Compute the fare quote from the booking's pickup/drop. Uses the same
  // /fares/quote endpoint as BookAmbulanceScreen so the patient sees the
  // exact breakdown the admin/server compute.
  useEffect(() => {
    let cancelled = false;
    if (!booking.pickupLat || !booking.pickupLng) return;
    faresApi
      .quote({
        pickupLat: booking.pickupLat,
        pickupLng: booking.pickupLng,
        dropLat: booking.dropLat ?? null,
        dropLng: booking.dropLng ?? null,
        couponCode: couponApplied ? coupon : null,
        vehicleType: "BLS",
        emergencyType: booking.emergencyType
      })
      .then((q) => { if (!cancelled) setQuote(q as FareQuoteForUi); })
      .catch(() => { /* fall back to whatever's on booking.payableInr */ });
    return () => { cancelled = true; };
  }, [booking.pickupLat, booking.pickupLng, booking.dropLat, booking.dropLng, coupon, couponApplied, booking.emergencyType]);

  const applyCoupon = useCallback(() => {
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    setCoupon(code);
    setCouponApplied(true);
  }, [coupon]);
  const removeCoupon = useCallback(() => {
    setCoupon("");
    setCouponApplied(false);
  }, []);

  // Mark paid. Idempotent server-side. On 200, route to onPaid (typically
  // RatingScreen → HistoryScreen).
  const finish = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await bookingsApi.markPaid(booking.id, couponApplied ? coupon : null);
      onPaid(r.booking);
    } catch (e: any) {
      // 409 wrong_state means the booking hasn't been marked complete yet
      // (race with the driver tapping Complete). Surface a hint and let the
      // user retry.
      const msg = String(e?.message ?? "");
      setErr(msg.includes("wrong_state")
        ? t("payment.wait_for_driver_to_complete") || "The driver hasn't marked the trip complete yet. Try again in a moment."
        : msg || "Payment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [booking.id, busy, coupon, couponApplied, onPaid, t]);

  const finalFare = quote?.coupon?.payableInr ?? booking.payableInr ?? booking.fareFinalInr ?? 0;

  return (
    <Screen>
      <AppHeader title={t("payment.title") || "Trip complete"} subtitle={`Booking ${booking.id.slice(0, 8)}…`} />

      <Card>
        <View style={{ gap: space.sm }}>
          <Text variant="label" tone="success" weight="bold" style={{ letterSpacing: 0.8 }}>
            {t("payment.complete_label") || "✓  TRIP COMPLETE"}
          </Text>
          <Text variant="heading" weight="bold">
            {t("payment.review_charges") || "Review and pay"}
          </Text>
          <Text variant="small" tone="secondary">
            {t("payment.hint") || "Apply your coupon and tap Mark paid to finish the ride."}
          </Text>
        </View>
      </Card>

      <Card>
        <FareBreakdown
          quote={quote}
          coupon={coupon}
          onCouponChange={setCoupon}
          couponApplied={couponApplied}
          onApply={applyCoupon}
          onRemove={removeCoupon}
          pilotCoupon={PILOT_COUPON}
          hideDistanceHint
          hideEta
        />
      </Card>

      {err ? (
        <Card flat>
          <Text variant="small" tone="danger">{err}</Text>
        </Card>
      ) : null}

      <Button
        label={busy
          ? (t("payment.processing") || "Processing…")
          : finalFare === 0
            ? (t("payment.finish_free") || "Mark paid · finish (₹0)")
            : (t("payment.finish_amount") || `Mark paid · finish · ₹${finalFare}`).replace("{amount}", String(finalFare))}
        onPress={finish}
        disabled={busy}
        fullWidth
      />
    </Screen>
  );
}
