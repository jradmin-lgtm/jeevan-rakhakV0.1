import React from "react";
import { FeedbackList } from "./FeedbackList";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getFeedback() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/feedback`, { cache: "no-store" });
    if (!res.ok) throw new Error("feedback");
    const data = await res.json();
    return data.bookings ?? [];
  } catch {
    return [];
  }
}

export default async function FeedbackPage() {
  const bookings = await getFeedback();
  return <FeedbackList initialBookings={bookings} apiBase={API_BASE} />;
}
