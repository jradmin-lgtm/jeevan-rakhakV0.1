import React from "react";
import { HospitalKpis } from "./HospitalKpis";
import { HospitalDashboardLive } from "./HospitalDashboardLive";

/**
 * Hospital portal dashboard (CR#3, v1.2.0) — the live incoming queue.
 *
 * Server shell only; all data fetching is client-side through the same-origin
 * /api/hospital-proxy (which forwards the hospital session JWT as a Bearer
 * token and NEVER the admin key). The client component polls every 10s and
 * also refetches on the `hospital:booking_update` socket event.
 */
export default function HospitalDashboardPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Incoming ambulances</h1>
          <p>Live queue of rides destined to your hospital. Updates automatically.</p>
        </div>
      </div>
      <div style={{ display: "grid", gap: 24 }}>
        <HospitalKpis />
        <HospitalDashboardLive />
      </div>
    </>
  );
}
