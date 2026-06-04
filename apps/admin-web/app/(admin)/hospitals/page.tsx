import React from "react";
import { adminFetch } from "../../../lib/adminFetch";
import { HospitalsManager } from "./HospitalsManager";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getHospitals() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/hospitals`);
    if (!res.ok) return { hospitals: [] };
    return res.json();
  } catch {
    return { hospitals: [] };
  }
}

// v1.1.0 (CR#3/#6): destination hospitals admin. In the current phase one
// active default (SRMS IMS, Bareilly) is auto-assigned to every ride at
// pickup; this page lets ops correct its pin/name and onboard more later.
export default async function HospitalsPage() {
  const data = await getHospitals();
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Hospitals</h1>
          <p className="muted">Destination hospitals. The default is auto-assigned to every ride at pickup.</p>
        </div>
      </div>
      <HospitalsManager initial={data.hospitals ?? []} apiBase={API_BASE} />
    </>
  );
}
