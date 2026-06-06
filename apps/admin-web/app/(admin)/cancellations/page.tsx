import React from "react";
import { CancellationsList } from "./CancellationsList";
import { adminFetch } from "../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getCancellations() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/cancellations`);
    if (!res.ok) throw new Error("cancellations");
    const data = await res.json();
    return data.cancellations ?? [];
  } catch {
    return [];
  }
}

export default async function CancellationsPage() {
  const cancellations = await getCancellations();
  return <CancellationsList initialCancellations={cancellations} apiBase={API_BASE} />;
}
