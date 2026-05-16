import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getBooking(id: string) {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/bookings/${id}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function BookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getBooking(id);
  if (!data) notFound();
  const { booking, events, user, driver } = data;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Booking {booking.id.slice(0, 8)}…</h1>
          <p>
            <Link href="/bookings" style={{ color: "var(--accent)" }}>← Back to bookings</Link>
            {booking.isDemo ? <span className="demo-flag" style={{ marginLeft: 12 }}>DEMO</span> : null}
          </p>
        </div>
        <span className={`pill ${booking.status.toLowerCase()}`}>{prettyStatus(booking.status)}</span>
      </div>

      <div className="row">
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Trip</h3>
          <Field label="Emergency type" value={prettyEmergency(booking.emergencyType)} />
          <Field label="Pickup" value={booking.pickupAddress ?? `${booking.pickupLat}, ${booking.pickupLng}`} />
          <Field label="Drop" value={booking.dropAddress ?? "Not specified"} />
          <Field label="Fare estimate" value={`₹${booking.fareEstimateInr ?? "—"}`} />
          <Field label="Fare final" value={booking.fareFinalInr ? `₹${booking.fareFinalInr}` : "Not closed yet"} />
          <Field label="Rating" value={booking.rating ? "★".repeat(booking.rating) : "Not rated"} />
          {booking.feedback ? <Field label="Feedback" value={booking.feedback} /> : null}
        </div>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Parties</h3>
          {user ? (
            <>
              <Field label="User" value={user.name ?? "Unnamed"} />
              <Field label="User phone" value={user.phone} />
              {user.bloodGroup ? <Field label="Blood group" value={user.bloodGroup} /> : null}
              {user.allergies ? <Field label="Allergies" value={user.allergies} /> : null}
              {user.emergencyContact ? <Field label="Emergency contact" value={user.emergencyContact} /> : null}
            </>
          ) : <div className="muted">User record missing.</div>}
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          {driver ? (
            <>
              <Field label="Driver" value={driver.name ?? "Unnamed"} />
              <Field label="Driver phone" value={driver.phone} />
              <Field label="Vehicle" value={driver.vehicleNumber ?? "—"} />
              <Field label="Rating" value={`⭐ ${(driver.rating ?? 5).toFixed(1)}`} />
            </>
          ) : <div className="muted">No driver assigned yet.</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 12px" }}>Event timeline</h3>
        <div className="timeline">
          {events.length === 0 ? (
            <div className="muted">No events recorded.</div>
          ) : (
            events.map((e: any) => (
              <div key={e.id} className="timeline-item">
                <div className="timeline-dot" />
                <div className="timeline-body">
                  <div style={{ fontWeight: 600 }}>{e.type}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{e.actor}</div>
                  <div className="timeline-time">{new Date(e.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function prettyEmergency(t: string): string {
  switch (t) {
    case "ACCIDENT_TRAUMA": return "Accident / Trauma";
    case "CARDIAC": return "Cardiac";
    case "BREATHING_DISTRESS": return "Breathing distress";
    case "PREGNANCY_NEONATAL": return "Pregnancy / Neonatal";
    case "GENERAL_CRITICAL_TRANSFER": return "Critical transfer";
    default: return t;
  }
}

function prettyStatus(s: string): string {
  switch (s) {
    case "REQUESTED": return "Searching";
    case "ACCEPTED": return "Driver assigned";
    case "ARRIVED": return "Driver arrived";
    case "PICKED_UP": return "On trip";
    case "COMPLETED": return "Completed";
    case "CANCELLED": return "Cancelled";
    case "TIMED_OUT": return "No driver";
    default: return s;
  }
}
