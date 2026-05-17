import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";
import { formatIST } from "../../../../lib/dates";
import { prettyStatus, prettyEmergency } from "../../../../lib/status";
import { resolveAmountPaid } from "../../../../lib/fare";
import { DisableToggle } from "../../users/[id]/DisableToggle";
import { KycVerifyToggle } from "./KycVerifyToggle";
import { EditableField } from "../../EditableField";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getDriver(id: string) {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/drivers/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DriverDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getDriver(id);
  if (!data) notFound();
  const { driver, bookings, totals } = data;

  return (
    <>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {driver.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={driver.pictureUrl} alt={driver.name ?? "Driver avatar"} width={56} height={56} style={{ borderRadius: 28, border: "1px solid var(--border)" }} />
          ) : null}
          <div>
          <h1>{driver.name ?? "Unnamed driver"}</h1>
          <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link href="/drivers" style={{ color: "var(--accent)" }}>← Back to drivers</Link>
            {driver.disabled ? (
              <>
                <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, background: "#DC2626", color: "#fff", textTransform: "uppercase" }}>
                  Disabled
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  (was {driver.status === "ON_TRIP" ? "on trip" : driver.status === "AVAILABLE" ? "available" : "offline"})
                </span>
              </>
            ) : (
              <>
                <span className="pill completed">Active</span>
                <span className={`pill ${driver.status.toLowerCase() === "on_trip" ? "accepted" : driver.status === "AVAILABLE" ? "completed" : "cancelled"}`}>
                  {driver.status === "ON_TRIP" ? "On trip" : driver.status === "AVAILABLE" ? "Available" : "Offline"}
                </span>
              </>
            )}
            {driver.authProvider === "google" ? (
              <span title="Signed in with Google" style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(66, 133, 244, 0.10)", color: "#1A73E8", fontWeight: 600 }}>Google</span>
            ) : null}
            {driver.email ? <span className="muted" style={{ fontSize: 12 }}>{driver.email}</span> : null}
          </p>
        </div>
        </div>
        <DisableToggle
          kind="driver"
          id={driver.id}
          initialDisabled={!!driver.disabled}
          apiBase={API_BASE}
        />
      </div>

      <div className="row">
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Profile</h3>
          <p className="muted" style={{ fontSize: 11, margin: "0 0 10px" }}>
            Click ✎ to edit any field. Changes reflect in the driver's app on next refresh.
          </p>
          <Field label="Phone" value={driver.phone} />
          <Field label="Email" value={driver.email ?? <span style={{ color: "var(--muted)" }}>—</span>} />
          <Field label="Auth provider" value={driver.authProvider === "google" ? "Google Sign-In" : <span style={{ color: "var(--muted)" }}>OTP (legacy)</span>} />
          <EditableField label="Name" value={driver.name} apiBase={API_BASE} patchUrl={`/api/v1/admin/drivers/${driver.id}`} fieldKey="name" placeholder="Full name" />
          <EditableField label="Vehicle #" value={driver.vehicleNumber} apiBase={API_BASE} patchUrl={`/api/v1/admin/drivers/${driver.id}`} fieldKey="vehicleNumber" placeholder="DL07AB1234" />
          <EditableField label="Vehicle type" value={driver.vehicleType} apiBase={API_BASE} patchUrl={`/api/v1/admin/drivers/${driver.id}`} fieldKey="vehicleType" placeholder="BLS / ALS / ICU" />
          <EditableField label="Licence #" value={driver.licenseNumber} apiBase={API_BASE} patchUrl={`/api/v1/admin/drivers/${driver.id}`} fieldKey="licenseNumber" placeholder="DL number" />
          <EditableField label="RC #" value={driver.rcNumber} apiBase={API_BASE} patchUrl={`/api/v1/admin/drivers/${driver.id}`} fieldKey="rcNumber" placeholder="RC number" />
          <EditableField label="Insurance #" value={driver.insuranceNumber} apiBase={API_BASE} patchUrl={`/api/v1/admin/drivers/${driver.id}`} fieldKey="insuranceNumber" placeholder="Policy number" />
          <EditableField label="Hospital" value={driver.hospitalName} apiBase={API_BASE} patchUrl={`/api/v1/admin/drivers/${driver.id}`} fieldKey="hospitalName" placeholder="Hospital / org" />
          <EditableField label="Hospital ID" value={driver.hospitalId} apiBase={API_BASE} patchUrl={`/api/v1/admin/drivers/${driver.id}`} fieldKey="hospitalId" placeholder="Employee ID" />
          <Field label="Rating" value={`⭐ ${(driver.rating ?? 5).toFixed(1)}`} />
          <Field label="Last seen" value={driver.lastSeenAt ? formatIST(driver.lastSeenAt) : "—"} />
          <Field label="Joined" value={formatIST(driver.createdAt)} />
        </div>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>KYC</h3>
          <Field label="Status" value={
            driver.kycVerified
              ? <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Verified</span>
              : <span style={{ color: "var(--danger, #DC2626)", fontWeight: 600 }}>Pending review</span>
          } />
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
            {driver.kycVerified
              ? "This driver can accept ride requests. Revoke if their KYC ever lapses."
              : "Driver has submitted all required fields. Verify against physical documents (licence, RC, insurance, hospital ID) before approving."}
          </div>
          <div style={{ marginTop: 12 }}>
            <KycVerifyToggle
              driverId={driver.id}
              initialVerified={!!driver.kycVerified}
              apiBase={API_BASE}
            />
          </div>
        </div>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Lifetime</h3>
          <Field label="Total trips" value={String(totals.total)} />
          <Field label="Completed" value={String(totals.completed)} />
          <Field label="Cancelled" value={String(totals.cancelled)} />
          <Field label="Lifetime earnings" value={`₹${totals.lifetimeEarningsInr}`} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0 }}>
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0 }}>Trip history</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Emergency</th>
                <th>Pickup → Drop</th>
                <th>Fare → Payable</th>
                <th>Rating</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: "center" }}>No trips yet.</td></tr>
              ) : (
                bookings.map((b: any) => (
                  <tr key={b.id}>
                    <td className="mono muted">{formatIST(b.createdAt)}</td>
                    <td>{prettyEmergency(b.emergencyType)}</td>
                    <td>
                      <div>{b.pickupAddress ?? "—"}</div>
                      {b.dropAddress ? <div className="muted" style={{ fontSize: 12 }}>→ {b.dropAddress}</div> : null}
                    </td>
                    <td className="mono">
                      {(() => {
                        const paid = resolveAmountPaid(b);
                        return (
                          <>
                            <div style={{ fontWeight: 600 }}>
                              {paid.amount == null ? "—" : `₹${paid.amount}`}
                              {paid.overridden ? <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "rgba(245,158,11,0.15)", color: "#B45309", fontWeight: 700 }}>OR</span> : null}
                            </div>
                            {b.couponCode ? <div className="muted" style={{ fontSize: 11 }}>{b.couponCode}</div> : null}
                          </>
                        );
                      })()}
                    </td>
                    <td>{b.rating ? "★".repeat(b.rating) : <span className="muted">—</span>}</td>
                    <td><span className={`pill ${b.status.toLowerCase()}`}>{prettyStatus(b.status)}</span></td>
                    <td><Link href={`/bookings/${b.id}`} style={{ color: "var(--accent)", fontSize: 12 }}>Open →</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

