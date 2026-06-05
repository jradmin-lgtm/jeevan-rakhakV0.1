import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";
import { prettyStatus } from "../../../../lib/status";
import { formatIST } from "../../../../lib/dates";
import { HospitalDrivers } from "./HospitalDrivers";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getHospital(id: string) {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/hospitals/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// v1.1.0 (CR#3/#6): hospital detail — a first-class entity like users/drivers.
// Shows the drivers tagged to this hospital + the bookings routed to it +
// rollups, so the network can be managed and scaled hospital-by-hospital.
export default async function HospitalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getHospital(id);
  if (!data) notFound();
  const { hospital: h, drivers: ds, bookings: bs, totals } = data;

  const stat = (label: string, value: React.ReactNode) => (
    <div className="card" style={{ flex: 1, minWidth: 120 }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>{h.name} {h.isDefault ? <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "#DCFCE7", color: "#166534" }}>DEFAULT</span> : null}</h1>
          <p>
            <Link href="/hospitals" style={{ color: "var(--accent)" }}>← Back to hospitals</Link>
            <span className="muted" style={{ marginLeft: 12 }}>{h.address ?? ""}{h.city ? `, ${h.city}` : ""} · {h.lat?.toFixed?.(4)}, {h.lng?.toFixed?.(4)} · {h.active ? "Active" : "Inactive"}</span>
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        {stat("Tagged drivers", totals.drivers)}
        {stat("Verified", totals.verifiedDrivers)}
        {stat("Online now", totals.onlineDrivers)}
        {stat("Bookings", totals.bookings)}
        {stat("Completed", totals.completed)}
        {stat("Active", totals.active)}
      </div>

      <div style={{ marginBottom: 16 }}>
        <HospitalDrivers hospitalId={id} apiBase={API_BASE} initial={ds} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Bookings routed here</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)" }}>
              <th style={{ padding: "6px 8px" }}>Booking</th>
              <th style={{ padding: "6px 8px" }}>Status</th>
              <th style={{ padding: "6px 8px" }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {bs.map((b: any) => (
              <tr key={b.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 8px" }}>
                  <Link href={`/bookings/${b.id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>#{b.displayId ?? b.id.slice(0, 8)}</Link>
                </td>
                <td style={{ padding: "6px 8px" }}>{prettyStatus(b.status)}</td>
                <td style={{ padding: "6px 8px" }}>{formatIST(b.createdAt)}</td>
              </tr>
            ))}
            {bs.length === 0 ? <tr><td colSpan={3} className="muted" style={{ padding: 12 }}>No bookings routed here yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
