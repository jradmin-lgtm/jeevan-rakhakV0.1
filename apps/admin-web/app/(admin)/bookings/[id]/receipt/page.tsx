import { TripReceipt } from "../../../../../components/TripReceipt";
import React from "react";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../../lib/adminFetch";
import { formatIST } from "../../../../../lib/dates";
import { prettyEmergency, prettyStatus } from "../../../../../lib/status";
import { resolveAmountPaid } from "../../../../../lib/fare";
import { PrintButton } from "./PrintButton";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getBooking(id: string) {
  try {
    // enrichDistance=true opts into the Google road-distance lookup — safe
    // here since this page is fetched once per view, never polled (unlike
    // the live booking-detail page hitting the same endpoint every 4s).
    const res = await adminFetch(`${API_BASE}/api/v1/admin/bookings/${id}?enrichDistance=true`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Trip receipt — printable A4 layout patients/hospitals can save as PDF for
 * their records. Surfaced from the bookings list via "📄 Receipt" link on
 * COMPLETED rows; reachable for any booking via the URL directly.
 *
 * Mirrors the existing /assessment route (admin sidebar collapses via
 * @media print; PrintButton triggers window.print()). No server-side PDF
 * generation — Render's free tier can't host headless Chromium.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getBooking(id);
  if (!data) notFound();
  return <TripReceipt data={data} backHref={`/bookings/${id}`} />;
}
