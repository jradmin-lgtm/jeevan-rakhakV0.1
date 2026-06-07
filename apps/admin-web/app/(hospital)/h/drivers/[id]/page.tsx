import React from "react";
import Link from "next/link";
import { DriverCardLive } from "./DriverCardLive";

/**
 * Hospital portal driver card (v1.2.1, CR#3) — a READ-ONLY, hospital-scoped
 * view of one driver: profile + live status, stats and rides computed ONLY over
 * rides destined to THIS hospital (never the driver's activity at other
 * clients). Server shell only; the client component fetches through
 * /api/hospital-proxy (hospital session JWT only, never the admin key), and the
 * endpoint 404s if the driver isn't associated with the caller's hospital.
 *
 * No KYC enable/disable here — that is admin-only. The portal only views the
 * verified badge + live ride statuses, and can "Raise concern" about the driver.
 */
export default async function HospitalDriverCardPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Driver</h1>
          <p>
            <Link href="/h/drivers" style={{ color: "var(--accent)" }}>← Back to your drivers</Link>
          </p>
        </div>
      </div>
      <DriverCardLive driverId={id} />
    </>
  );
}
