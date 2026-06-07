import React from "react";
import { HospitalSupportLive } from "./HospitalSupportLive";

/**
 * Hospital portal Support page (v1.2.1, CR#3) — raise a feedback/concern ticket
 * (driver / ride / general) and track your hospital's own tickets. Server shell
 * only; the client component fetches through /api/hospital-proxy (hospital JWT
 * only, never the admin key), scoped server-side to this hospital's tickets.
 */
export default function HospitalSupportPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Support</h1>
          <p>Raise a concern or share feedback with the operations team, and track its status.</p>
        </div>
      </div>
      <HospitalSupportLive />
    </>
  );
}
