import React from "react";
import { HospitalHistoryLive } from "./HospitalHistoryLive";

/**
 * Hospital portal History page (v1.2.1, CR#3) — the full record of EVERY ride
 * destined to this hospital (active + completed + cancelled + timed-out), not
 * just the live queue. Server shell only; the client component fetches through
 * /api/hospital-proxy (hospital session JWT only, never the admin key), scoped
 * server-side to dest_hospital_id = this hospital via `?scope=all`.
 */
export default function HospitalHistoryPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Ride history</h1>
          <p>Every ambulance destined to your hospital — active, completed and cancelled. Newest first.</p>
        </div>
      </div>
      <HospitalHistoryLive />
    </>
  );
}
