import React from "react";
import { HospitalHelpLive } from "./HospitalHelpLive";

/**
 * Hospital portal Help & Support page (v1.2.2; was Support in v1.2.1, CR#3) —
 * raise an ISSUE the operations team should resolve (driver / ride / general)
 * and track its Open/Resolved status. Soft feedback now lives on the separate
 * Feedbacks tab. Server shell only; the client component fetches through
 * /api/hospital-proxy (hospital JWT only, never the admin key), scoped
 * server-side to this hospital's tickets and to category=ISSUE.
 */
export default function HospitalHelpPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Help &amp; Support</h1>
          <p>Raise an issue for the operations team to resolve, and track its status.</p>
        </div>
      </div>
      <HospitalHelpLive />
    </>
  );
}
