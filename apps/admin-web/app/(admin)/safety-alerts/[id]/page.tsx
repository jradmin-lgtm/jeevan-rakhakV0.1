import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";
import { SafetyAlertDetailLive } from "./SafetyAlertDetailLive";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

// The admin safety surface serves the full row set off GET /api/v1/admin/safety
// (newest-first, joined with the responder list). There is no single-row admin
// endpoint, so the detail page seeds from the ?status=all set and picks the row
// by id; the live component then polls the same list and reconciles its row.
async function getAlert(id: string) {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/safety?status=all`);
    if (!res.ok) return null;
    const data = await res.json();
    const alerts = data.alerts ?? [];
    return alerts.find((a: { id: string }) => a.id === id) ?? null;
  } catch {
    return null;
  }
}

export default async function SafetyAlertDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAlert(id);
  if (!data) notFound();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Safety alert</h1>
          <p>
            <Link href="/alerts" style={{ color: "var(--accent)" }}>← Back to Alerts</Link>
            <span className="muted mono" style={{ marginLeft: 12, fontSize: 11 }}>{id}</span>
          </p>
        </div>
      </div>
      <SafetyAlertDetailLive alertId={id} initialData={data} apiBase={API_BASE} />
    </>
  );
}
