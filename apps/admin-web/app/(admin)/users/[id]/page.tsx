import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";
import { formatIST } from "../../../../lib/dates";
import { prettyStatus, prettyEmergency } from "../../../../lib/status";
import { resolveAmountPaid } from "../../../../lib/fare";
import { DisableToggle } from "./DisableToggle";
import { EditableField } from "../../EditableField";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getUser(id: string) {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/users/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getUser(id);
  if (!data) notFound();
  const { user, bookings, totals } = data;

  return (
    <>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {user.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.pictureUrl} alt={user.name ?? "User avatar"} width={56} height={56} style={{ borderRadius: 28, border: "1px solid var(--border)" }} />
          ) : null}
          <div>
            <h1>{user.name ?? "Unnamed user"}</h1>
            <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Link href="/users" style={{ color: "var(--accent)" }}>← Back to users</Link>
              {user.disabled ? <span className="pill cancelled">Disabled</span> : <span className="pill completed">Active</span>}
              {user.authProvider === "google" ? (
                <span title="Signed in with Google" style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(66, 133, 244, 0.10)", color: "#1A73E8", fontWeight: 600 }}>Google</span>
              ) : null}
              {user.email ? <span className="muted" style={{ fontSize: 12 }}>{user.email}</span> : null}
            </p>
          </div>
        </div>
        <DisableToggle
          kind="user"
          id={user.id}
          initialDisabled={!!user.disabled}
          apiBase={API_BASE}
        />
      </div>

      <div className="row">
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Profile</h3>
          <p className="muted" style={{ fontSize: 11, margin: "0 0 10px" }}>
            Click ✎ to edit any field. Changes reflect in the user's app on next refresh.
          </p>
          <Field label="Phone" value={user.phone} />
          <Field label="Email" value={user.email ?? <span style={{ color: "var(--muted)" }}>—</span>} />
          <Field label="Auth provider" value={user.authProvider === "google" ? "Google Sign-In" : <span style={{ color: "var(--muted)" }}>OTP (legacy)</span>} />
          <EditableField label="Name" value={user.name} apiBase={API_BASE} patchUrl={`/api/v1/admin/users/${user.id}`} fieldKey="name" placeholder="Full name" />
          <EditableField label="Blood group" value={user.bloodGroup} apiBase={API_BASE} patchUrl={`/api/v1/admin/users/${user.id}`} fieldKey="bloodGroup" placeholder="e.g. O+" />
          <EditableField label="Allergies" value={user.allergies} apiBase={API_BASE} patchUrl={`/api/v1/admin/users/${user.id}`} fieldKey="allergies" placeholder="None / list" multiline />
          <EditableField label="Emergency contact" value={user.emergencyContact} apiBase={API_BASE} patchUrl={`/api/v1/admin/users/${user.id}`} fieldKey="emergencyContact" placeholder="+91…" />
          <Field label="Joined" value={formatIST(user.createdAt)} />
        </div>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Lifetime</h3>
          <Field label="Total bookings" value={String(totals.total)} />
          <Field label="Completed" value={String(totals.completed)} />
          <Field label="Cancelled" value={String(totals.cancelled)} />
          <Field label="Lifetime payable" value={`₹${totals.lifetimePayableInr}`} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16, padding: 0 }}>
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0 }}>Booking history</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Emergency</th>
                <th>Pickup → Drop</th>
                <th>Fare → Payable</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={6} className="muted" style={{ padding: 24, textAlign: "center" }}>No bookings yet.</td></tr>
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

