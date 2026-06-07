import React from "react";
import { HospitalFeedbacksLive } from "./HospitalFeedbacksLive";

/**
 * Hospital portal Feedbacks page (v1.2.2). Soft feedback the hospital wants to
 * share with the operations team (not an actionable issue — that lives on Help &
 * Support). Server shell only; the client component fetches through
 * /api/hospital-proxy (hospital JWT only, never the admin key), scoped
 * server-side to this hospital's tickets and to category=FEEDBACK.
 */
export default function HospitalFeedbacksPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Feedbacks</h1>
          <p>Share feedback with the operations team. For something that needs fixing, use Help &amp; Support.</p>
        </div>
      </div>
      <HospitalFeedbacksLive />
    </>
  );
}
