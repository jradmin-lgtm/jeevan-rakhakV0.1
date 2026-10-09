import React, { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { AppHeader, Button, Card, FareBreakdown, Screen, Text, space } from "@jr/ui";
import { Booking, bookings as bookingsApi } from "../api";
import { useT } from "../i18n";

type Props = { booking: Booking; onPaid: (booking: Booking) => void };
type Preview = Awaited<ReturnType<typeof bookingsApi.paymentPreview>>;

export function PaymentScreen({ booking: initial, onPaid }: Props) {
  const { t, lang } = useT();
  const hi = lang === "hi";
  const [coupon, setCoupon] = useState(initial.couponCode ?? "");
  const [appliedCode, setAppliedCode] = useState<string | null>(initial.couponCode ?? null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const paidCallback = useRef(onPaid);
  paidCallback.current = onPaid;

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sequence = ++request.current;
    setLoading(true);
    setPreview(null);
    setErr(null);
    bookingsApi.paymentPreview(initial.id, appliedCode).then(result => {
      if (request.current !== sequence) return;
      if (result.alreadyPaid) { paidCallback.current(result.booking); return; }
      setPreview(result);
      if (!result.couponValid) setErr(hi ? "यह कूपन मान्य नहीं है। दूसरा कोड डालें या कूपन हटाएँ।" : "This coupon is not valid. Try another code or remove it.");
    }).catch(error => {
      if (request.current !== sequence) return;
      console.warn("payment_preview_failed", error?.message);
      setErr(hi ? "किराया लोड नहीं हुआ। कनेक्शन जाँचकर फिर कोशिश करें।" : "Could not load the fare. Check your connection and retry.");
    }).finally(() => { if (request.current === sequence) setLoading(false); });
    return () => { request.current++; };
  }, [initial.id, appliedCode, retry, hi]);

  const applyCoupon = (code?: string) => {
    const normalized = (code ?? coupon).trim().toUpperCase();
    if (!normalized) return;
    setLoading(true);
    setCoupon(normalized);
    setAppliedCode(normalized);
    setRetry(value => value + 1);
  };
  const removeCoupon = () => { setLoading(true); setCoupon(""); setAppliedCode(null); };
  const finish = useCallback(async () => {
    if (busy || loading || !preview?.couponValid) return;
    setBusy(true);
    setErr(null);
    try {
      const result = await bookingsApi.markPaid(initial.id, appliedCode);
      onPaid(result.booking);
    } catch (error: any) {
      console.warn("payment_save_failed", error?.message);
      setErr(hi ? "भुगतान दर्ज नहीं हुआ। फिर कोशिश करें।" : "Could not record the payment. Please retry.");
    } finally { setBusy(false); }
  }, [busy, loading, preview, initial.id, appliedCode, onPaid, hi]);
  const amount = preview?.breakdown.payableInr;

  return (
    <Screen
      header={<AppHeader title={t("payment.title")} subtitle={t("payment.booking_number").replace("{id}", String(initial.displayId ?? initial.id.slice(0, 8)))} />}
      footer={<Button label={busy ? t("payment.processing") : amount == null ? (hi ? "किराया लोड हो रहा है" : "Loading fare") : amount === 0 ? t("payment.finish_free") : t("payment.finish_amount").replace("{amount}", String(amount))}
        onPress={finish} loading={busy} disabled={busy || loading || !preview?.couponValid} fullWidth size="lg" />}
    >
      <View style={{ gap: space.sm, paddingVertical: space.md }}>
        <Text variant="label" tone="success" weight="bold">{t("payment.complete_label")}</Text>
        <Text variant="heading" weight="bold">{t("payment.review_charges")}</Text>
        <Text variant="small" tone="secondary">{t("payment.hint")}</Text>
      </View>
      <Card>
        <FareBreakdown quote={null} lockedFare={preview?.breakdown ?? null} lang={lang}
          coupon={coupon} onCouponChange={setCoupon} couponApplied={!!preview?.breakdown.couponCode}
          onApply={applyCoupon} onRemove={removeCoupon} disabled={busy || loading}
          pilotCoupon="PILOT100" hideDistanceHint hideEta />
      </Card>
      {err ? <View style={{ gap: space.sm }}>
        <Text variant="small" tone="danger" accessibilityRole="alert">{err}</Text>
        {preview?.couponValid === false ? <Button label={hi ? "कूपन हटाएँ" : "Remove coupon"} onPress={removeCoupon} variant="ghost" /> : null}
        {!preview && !loading ? <Button label={hi ? "फिर कोशिश करें" : "Retry"} onPress={() => setRetry(value => value + 1)} variant="outline" /> : null}
      </View> : null}
    </Screen>
  );
}
