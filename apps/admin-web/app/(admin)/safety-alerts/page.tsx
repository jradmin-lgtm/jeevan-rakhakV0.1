import React from "react";
import { SafetyAlertsClient } from "./SafetyAlertsClient";
import { adminFetch } from "../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// Seed with the Active view (default the backend serves at ?status=active) so
// the operator lands on live alerts first; the client then live-polls.
async function getAlerts() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/safety?status=active`);
    if (!res.ok) throw new Error("safety");
    const data = await res.json();
    return data.alerts ?? [];
  } catch {
    return [];
  }
}

export default async function SafetyAlertsPage() {
  const alerts = await getAlerts();
  return <SafetyAlertsClient initialAlerts={alerts} apiBase={API_BASE} />;
}
