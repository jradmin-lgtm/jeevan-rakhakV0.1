import React from "react";
import { HospitalDriversLive } from "./HospitalDriversLive";

/**
 * Hospital portal driver monitor (CR#3, v1.2.0) — total / online / on-trip
 * counts + the hospital's tagged drivers with live status. Server shell only;
 * the client component fetches /hospital/me + /hospital/drivers through the
 * same-origin /api/hospital-proxy (hospital JWT only, never the admin key).
 */
export default function HospitalDriversPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Your drivers</h1>
          <p>Ambulances tagged to your hospital and their live availability.</p>
        </div>
      </div>
      <HospitalDriversLive />
    </>
  );
}
