"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../../lib/adminFetch";
import { formatIST, formatTimeIST } from "../../../../lib/dates";
import { prettyStatus, prettyEmergency, assessmentBadge } from "../../../../lib/status";

type BookingEvent = {
  id: string;
  type: string;
  actor: string;
  createdAt: string;
};

type Booking = {
  id: string;
  displayId?: string | null;
  status: string;
  emergencyType: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string | null;
  dropAddress?: string | null;
  rideOtpCode?: string | null;
  fareEstimateInr?: number | null;
  fareFinalInr?: number | null;
  adminFareOverrideInr?: number | null;
  adminFareOverrideNote?: string | null;
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
  ratingByDriver?: number | null;
  feedbackByDriver?: string | null;
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

  const assessment = assessmentBadge(booking.status, booking.paramedicAssessment);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className={`pill ${booking.status.toLowerCase()}`}>{prettyStatus(booking.status)}</span>
          <AssessmentPill badge={assessment} />
        </div>
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
          {/* Both directions of the rating shown side-by-side. Stars styled
            * gold so they stand out from the muted grey labels. */}
          <Field
            label="Patient → driver"
            value={booking.rating
              ? <span style={{ color: "#F59E0B", letterSpacing: 1 }}>{"★".repeat(booking.rating)}{"☆".repeat(5 - booking.rating)}</span>
              : <span style={{ color: "var(--muted)" }}>Not rated</span>}
          />
          {booking.feedback ? <Field label="↳ feedback" value={`“${booking.feedback}”`} /> : null}
          <Field
            label="Driver → patient"
            value={booking.ratingByDriver
              ? <span style={{ color: "#F59E0B", letterSpacing: 1 }}>{"★".repeat(booking.ratingByDriver)}{"☆".repeat(5 - booking.ratingByDriver)}</span>
              : <span style={{ color: "var(--muted)" }}>Not rated</span>}
          />
          {booking.feedbackByDriver ? <Field label="↳ feedback" value={`“${booking.feedbackByDriver}”`} /> : null}
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
            label="App final"
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
            <span style={{ fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Payable in app</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: payable === 0 ? "var(--success)" : "var(--ink)" }}>
              ₹{payable}
            </span>
          </div>
          {/* Admin fare override — for off-app billing (e.g. hospital invoices).
            * Mobile apps never see this. Analytics GMV uses this when set. */}
          <FareOverride
            bookingId={booking.id}
            apiBase={apiBase}
            initialAmount={booking.adminFareOverrideInr ?? null}
            initialNote={booking.adminFareOverrideNote ?? ""}
            onSaved={(b) => setData((curr) => ({ ...curr, booking: { ...curr.booking, ...b } }))}
          />
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" }}>
                  Paramedic assessment {booking.paramedicAssessment.recordedAt ? `· ${formatIST(String(booking.paramedicAssessment.recordedAt))}` : ""}
                </div>
                <Link
                  href={`/bookings/${booking.id}/assessment`}
                  target="_blank"
                  style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, padding: "4px 10px", border: "1px solid var(--accent, #1E5EFF)", borderRadius: 6, textDecoration: "none" }}
                >
                  📄 Print / save as PDF →
                </Link>
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

/**
 * Inline editor for the admin-only fare override. Edits never reach the
 * mobile apps — they keep showing the original fareEstimate/fareFinal/
 * payable. Analytics GMV uses the override when set. Empty clears.
 */
function FareOverride({
  bookingId,
  apiBase,
  initialAmount,
  initialNote,
  onSaved
}: {
  bookingId: string;
  apiBase: string;
  initialAmount: number | null;
  initialNote: string;
  onSaved: (b: Partial<Booking>) => void;
}) {
  const [amount, setAmount] = React.useState(initialAmount != null ? String(initialAmount) : "");
  const [note, setNote] = React.useState(initialNote);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  // Sync when the booking polls and the override changes externally.
  React.useEffect(() => {
    setAmount(initialAmount != null ? String(initialAmount) : "");
    setNote(initialNote);
  }, [initialAmount, initialNote]);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const body: any = {
        fareOverrideInr: amount.trim() === "" ? null : parseInt(amount, 10),
        fareOverrideNote: note.trim() === "" ? null : note
      };
      const res = await adminFetch(`${apiBase}/api/v1/admin/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      const { booking: updated } = await res.json();
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const isDirty = (amount.trim() === "" ? null : parseInt(amount, 10)) !== initialAmount || note !== initialNote;

  return (
    <div style={{ marginTop: 14, padding: "12px 0 0", borderTop: "1px dashed var(--border)" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>
        Admin fare override <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>(off-app billing · invisible to users)</span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ color: "var(--muted)" }}>₹</span>
        <input
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="leave blank to clear"
          style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "var(--ink)" }}
        />
      </div>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional, e.g. invoice #/hospital)"
        style={{ marginTop: 6, width: "100%", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: "var(--ink)" }}
      />
      {err ? <div style={{ color: "var(--danger, #DC2626)", fontSize: 12, marginTop: 4 }}>{err}</div> : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontSize: 11, color: saved ? "var(--success, #10B981)" : "var(--muted)" }}>
          {saved ? "✓ Saved" : initialAmount != null ? `Currently overriding to ₹${initialAmount}` : "Not overridden"}
        </span>
        <button
          onClick={submit}
          disabled={busy || !isDirty}
          style={{
            background: isDirty ? "var(--ink, #0F172A)" : "transparent",
            color: isDirty ? "#fff" : "var(--muted)",
            border: isDirty ? "none" : "1px solid var(--border)",
            padding: "6px 14px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: isDirty && !busy ? "pointer" : "default",
            opacity: busy ? 0.6 : 1
          }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
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

function AssessmentPill({ badge }: { badge: { label: string; variant: "submitted" | "risk" | "awaiting" | "na" } }) {
  if (badge.variant === "na") return null;
  const styleByVariant: Record<"submitted" | "risk" | "awaiting", React.CSSProperties> = {
    submitted: { background: "rgba(16,185,129,0.10)", color: "var(--success, #059669)", border: "1px solid rgba(16,185,129,0.30)" },
    risk:      { background: "rgba(220,38,38,0.10)", color: "var(--danger, #DC2626)", border: "1px solid rgba(220,38,38,0.35)" },
    awaiting:  { background: "rgba(245,158,11,0.10)", color: "#B45309", border: "1px solid rgba(245,158,11,0.30)" }
  };
  return (
    <span
      title="Paramedic assessment status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        ...styleByVariant[badge.variant]
      }}
    >
      {badge.label}
    </span>
  );
}
