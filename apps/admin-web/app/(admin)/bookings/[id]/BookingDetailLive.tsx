"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../../lib/adminFetch";
import { formatIST, formatTimeIST } from "../../../../lib/dates";

type BookingEvent = {
  id: string;
  type: string;
  actor: string;
  createdAt: string;
};

type Booking = {
  id: string;
  status: string;
  emergencyType: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string | null;
  dropAddress?: string | null;
  rideOtpCode?: string | null;
  fareEstimateInr?: number | null;
  fareFinalInr?: number | null;
  couponCode?: string | null;
  discountInr?: number | null;
  payableInr?: number | null;
  patientName?: string | null;
  patientAge?: number | null;
  patientGender?: "M" | "F" | "O" | null;
  patientCondition?: string | null;
  patientNotes?: string | null;
  paramedicAssessment?: Record<string, any> | null;
  rating?: number | null;
  feedback?: string | null;
  isDemo?: boolean;
};

type Detail = {
  booking: Booking;
  events: BookingEvent[];
  user: any;
  driver: any;
};

const POLL_MS = 4000;

/**
 * Booking detail body — polls /api/v1/admin/bookings/:id every 4s so the
 * status pill, fare numbers (final + discount + payable land at /complete),
 * and event timeline update without a manual refresh. New events flash
 * briefly so operators can spot what just happened.
 */
export function BookingDetailLive({
  bookingId,
  initialData,
  apiBase
}: {
  bookingId: string;
  initialData: Detail;
  apiBase: string;
}) {
  const [data, setData] = useState<Detail>(initialData);
  const [lastFetch, setLastFetch] = useState<number>(Date.now());
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const knownEventIds = useRef<Set<string>>(new Set(initialData.events.map((e) => e.id)));

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/bookings/${bookingId}`);
        if (!res.ok) return;
        const next: Detail = await res.json();
        if (!alive) return;
        // Detect newly-arrived events so we can flash them.
        const fresh = next.events.filter((e) => !knownEventIds.current.has(e.id));
        if (fresh.length > 0) {
          const freshIds = new Set(fresh.map((e) => e.id));
          setNewEventIds(freshIds);
          fresh.forEach((e) => knownEventIds.current.add(e.id));
          // Clear the flash after 3s.
          setTimeout(() => {
            setNewEventIds((prev) => {
              const out = new Set(prev);
              freshIds.forEach((id) => out.delete(id));
              return out;
            });
          }, 3000);
        }
        setData(next);
        setLastFetch(Date.now());
      } catch {
        /* keep last good */
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase, bookingId]);

  const { booking, events, user, driver } = data;
  const fareEstimate = booking.fareEstimateInr ?? 0;
  const discount = booking.discountInr ?? 0;
  const payable = booking.payableInr ?? (booking.fareFinalInr ?? fareEstimate);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span className={`pill ${booking.status.toLowerCase()}`}>{prettyStatus(booking.status)}</span>
        <span className="muted" style={{ fontSize: 12 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
          Live · refreshed {formatTimeIST(new Date(lastFetch))}
        </span>
      </div>

      <div className="row">
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Trip</h3>
          <Field label="Emergency type" value={prettyEmergency(booking.emergencyType)} />
          <Field label="Pickup" value={booking.pickupAddress ?? `${booking.pickupLat}, ${booking.pickupLng}`} />
          <Field label="Drop" value={booking.dropAddress ?? "Not specified"} />
          <Field label="Ride OTP" value={booking.rideOtpCode ?? "—"} />
          <Field label="Rating" value={booking.rating ? "★".repeat(booking.rating) : "Not rated"} />
          {booking.feedback ? <Field label="Feedback" value={booking.feedback} /> : null}
        </div>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Fare</h3>
          <Field label="Estimate" value={`₹${fareEstimate}`} />
          <Field
            label="Coupon"
            value={booking.couponCode ?? <span style={{ color: "var(--muted)" }}>None</span>}
          />
          {discount > 0 ? <Field label="Discount" value={<span style={{ color: "var(--success)" }}>− ₹{discount}</span>} /> : null}
          <Field
            label="Final"
            value={booking.fareFinalInr ? `₹${booking.fareFinalInr}` : <span style={{ color: "var(--muted)" }}>Not closed yet</span>}
          />
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0 0",
            borderTop: "1px solid var(--border)",
            marginTop: 6
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Payable</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: payable === 0 ? "var(--success)" : "var(--ink)" }}>
              ₹{payable}
            </span>
          </div>
        </div>
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Parties</h3>
          {user ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>User</span>
                <Link href={`/users/${user.id}`} style={{ color: "var(--accent)", fontSize: 13, fontWeight: 500 }}>{user.name ?? "Unnamed"} →</Link>
              </div>
              <Field label="User phone" value={user.phone} />
              {user.bloodGroup ? <Field label="Blood group" value={user.bloodGroup} /> : null}
              {user.allergies ? <Field label="Allergies" value={user.allergies} /> : null}
              {user.emergencyContact ? <Field label="Emergency contact" value={user.emergencyContact} /> : null}
            </>
          ) : <div className="muted">User record missing.</div>}
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
          {driver ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>Driver</span>
                <Link href={`/drivers/${driver.id}`} style={{ color: "var(--accent)", fontSize: 13, fontWeight: 500 }}>{driver.name ?? "Unnamed"} →</Link>
              </div>
              <Field label="Driver phone" value={driver.phone} />
              <Field label="Vehicle" value={driver.vehicleNumber ?? "—"} />
              <Field label="Rating" value={`⭐ ${(driver.rating ?? 5).toFixed(1)}`} />
            </>
          ) : <div className="muted">No driver assigned yet.</div>}
        </div>
      </div>

      {/* Patient + paramedic clinical details — admin/hospital only. Driver
        * app never displays the condition / notes / paramedic assessment
        * per the v1.0.11 visibility rules. */}
      {(booking.patientCondition || booking.patientName || booking.paramedicAssessment) ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 12px" }}>Clinical brief · admin / hospital only</h3>
          {booking.patientName || booking.patientAge || booking.patientGender ? (
            <Field label="Patient" value={[
              booking.patientName,
              booking.patientAge ? `${booking.patientAge}y` : null,
              booking.patientGender === "M" ? "Male" : booking.patientGender === "F" ? "Female" : booking.patientGender === "O" ? "Other" : null
            ].filter(Boolean).join(" · ") || "—"} />
          ) : null}
          {booking.patientCondition ? <Field label="Condition" value={<strong style={{ color: "var(--danger, #DC2626)" }}>{booking.patientCondition}</strong>} /> : null}
          {booking.patientNotes ? <Field label="User notes" value={booking.patientNotes} /> : null}
          {booking.paramedicAssessment ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)", marginBottom: 8 }}>
                Paramedic assessment {booking.paramedicAssessment.recordedAt ? `· ${formatIST(String(booking.paramedicAssessment.recordedAt))}` : ""}
              </div>
              {booking.paramedicAssessment.immediateRisk ? (
                <div style={{ background: "rgba(220,38,38,0.08)", color: "var(--danger, #DC2626)", padding: 8, borderRadius: 6, fontWeight: 700, marginBottom: 8 }}>
                  🚨 IMMEDIATE RISK TO LIFE flagged by paramedic
                </div>
              ) : null}
              {Object.entries(booking.paramedicAssessment).map(([k, v]) => {
                if (["recordedAt", "recordedBy", "immediateRisk"].includes(k) || v == null || v === "") return null;
                return <Field key={k} label={prettyAssessmentKey(k)} value={String(v)} />;
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ margin: "0 0 12px" }}>Event timeline · {events.length}</h3>
        <div className="timeline">
          {events.length === 0 ? (
            <div className="muted">No events recorded.</div>
          ) : (
            events.map((e) => {
              const isNew = newEventIds.has(e.id);
              return (
                <div
                  key={e.id}
                  className="timeline-item"
                  style={isNew ? {
                    background: "rgba(16, 185, 129, 0.08)",
                    borderRadius: 6,
                    padding: 4,
                    transition: "background 1.5s ease-out"
                  } : undefined}
                >
                  <div className="timeline-dot" style={isNew ? { background: "var(--success)" } : undefined} />
                  <div className="timeline-body">
                    <div style={{ fontWeight: 600 }}>
                      {e.type}
                      {isNew ? <span style={{ marginLeft: 8, fontSize: 10, color: "var(--success)", fontWeight: 700, letterSpacing: 0.4 }}>NEW</span> : null}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>{e.actor}</div>
                    <div className="timeline-time">{formatIST(e.createdAt)}</div>
                  </div>
                </div>
              );
            })
          )}
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

function prettyAssessmentKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/_/g, " ");
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
