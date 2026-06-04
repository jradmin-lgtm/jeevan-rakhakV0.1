import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../../lib/adminFetch";
import { MedicalRecordLive } from "./MedicalRecordLive";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getMedical(id: string) {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/bookings/${id}/medical`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// v1.1.0 (CR#9a): live, unified pre-arrival medical record. Section A
// (patient-submitted) + Section B (paramedic assessment) + timeline, polled
// in real time so the hospital can prep before the ambulance arrives.
export default async function MedicalRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getMedical(id);
  if (!data) notFound();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Medical record · #{data.displayId ?? id.slice(0, 8) + "…"}</h1>
          <p>
            <Link href={`/bookings/${id}`} style={{ color: "var(--accent)" }}>← Back to booking</Link>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link
            href={`/bookings/${id}/assessment`}
            target="_blank"
            title="Open printable assessment PDF"
            style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 6, textDecoration: "none", background: "#fff" }}
          >
            📄 View PDF
          </Link>
        </div>
      </div>
      <MedicalRecordLive bookingId={id} initialData={data} apiBase={API_BASE} />
    </>
  );
}
