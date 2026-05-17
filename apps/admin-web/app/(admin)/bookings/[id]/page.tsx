import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";
import { BookingDetailLive } from "./BookingDetailLive";
import { DeleteBookingButton } from "../DeleteBookingButton";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getBooking(id: string) {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/bookings/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getBooking(id);
  if (!data) notFound();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Booking #{data.booking.displayId ?? data.booking.id.slice(0, 8) + "…"}</h1>
          <p>
            <Link href="/bookings" style={{ color: "var(--accent)" }}>← Back to bookings</Link>
            <span className="muted mono" style={{ marginLeft: 12, fontSize: 11 }}>{data.booking.id}</span>
          </p>
        </div>
        <DeleteBookingButton bookingId={id} apiBase={API_BASE} />
      </div>
      <BookingDetailLive bookingId={id} initialData={data} apiBase={API_BASE} />
    </>
  );
}
