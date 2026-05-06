import React from "react";
import { BookingsList } from "./BookingsList";
import { adminFetch } from "../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getBookings() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/bookings`);
    if (!res.ok) throw new Error("bookings");
    const data = await res.json();
    return data.bookings ?? [];
  } catch {
    return [];
  }
}

export default async function BookingsPage() {
  const bookings = await getBookings();
  return <BookingsList initialBookings={bookings} apiBase={API_BASE} />;
}
