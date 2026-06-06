import React from "react";
import Link from "next/link";
import { PatientRecordLive } from "./PatientRecordLive";

/**
 * Hospital portal patient record (CR#3, v1.2.0) — the live A/B/C view of a
 * single incoming ride. Server shell only; the client component fetches
 * through /api/hospital-proxy (hospital JWT only, never the admin key),
 * RBAC-scoped server-side to this hospital's rides (cross-hospital → 404).
 */
export default async function HospitalPatientRecordPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Patient record</h1>
          <p>
            <Link href="/h" style={{ color: "var(--accent)" }}>← Back to incoming queue</Link>
          </p>
        </div>
      </div>
      <PatientRecordLive bookingId={id} />
    </>
  );
}
