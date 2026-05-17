import React from "react";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../../lib/adminFetch";
import { formatIST } from "../../../../../lib/dates";
import { prettyEmergency, prettyStatus } from "../../../../../lib/status";
import { PrintButton } from "./PrintButton";

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

/**
 * Print-friendly paramedic assessment view. Opens in a new tab from the
 * booking detail page. Layout is plain, A4-friendly, no chrome — meant to
 * be saved via the browser's "Print → Save as PDF". The "Print / save as
 * PDF" button just triggers window.print(); no server-side PDF generation
 * (which would need puppeteer + chromium on the Render free tier).
 */
export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getBooking(id);
  if (!data) notFound();
  const { booking, user, driver } = data;
  const a = booking.paramedicAssessment ?? null;

  return (
    <div className="assess-page">
      <style>{cssBlock}</style>
      <div className="assess-toolbar print-hide">
        <a href={`/bookings/${id}`}>← Back to booking</a>
        <PrintButton />
      </div>

      <div className="assess-doc">
        <header className="assess-header">
          <div>
            <h1>Paramedic Assessment</h1>
            <div className="muted">
              Booking #{booking.displayId ?? booking.id.slice(0, 8) + "…"} ·{" "}
              {prettyEmergency(booking.emergencyType)} · {prettyStatus(booking.status)}
            </div>
          </div>
          <div className="brand">
            <div className="brand-name">Jeevan Rakshak</div>
            <div className="muted small">Emergency Ambulance Service</div>
          </div>
        </header>

        <section className="assess-section">
          <h2>Patient</h2>
          <div className="grid">
            <KV label="Name" value={booking.patientName ?? user?.name ?? "—"} />
            <KV label="Age" value={booking.patientAge ? `${booking.patientAge} years` : "—"} />
            <KV
              label="Gender"
              value={
                booking.patientGender === "M"
                  ? "Male"
                  : booking.patientGender === "F"
                    ? "Female"
                    : booking.patientGender === "O"
                      ? "Other"
                      : "—"
              }
            />
            <KV label="Phone" value={user?.phone ?? "—"} />
            <KV label="Blood group" value={user?.bloodGroup ?? "—"} />
            <KV label="Known allergies" value={user?.allergies ?? "—"} />
            <KV label="Patient-reported condition" value={booking.patientCondition ?? "—"} fullWidth />
            <KV label="User notes" value={booking.patientNotes ?? "—"} fullWidth />
          </div>
        </section>

        <section className="assess-section">
          <h2>Trip</h2>
          <div className="grid">
            <KV label="Pickup" value={booking.pickupAddress ?? `${booking.pickupLat}, ${booking.pickupLng}`} fullWidth />
            <KV label="Drop / hospital" value={booking.dropAddress ?? "Not specified"} fullWidth />
            <KV label="Booking created (IST)" value={formatIST(booking.createdAt)} />
            <KV label="Ride OTP" value={booking.rideOtpCode ?? "—"} />
          </div>
        </section>

        <section className="assess-section">
          <h2>Driver / Paramedic</h2>
          <div className="grid">
            <KV label="Name" value={driver?.name ?? "Not assigned"} />
            <KV label="Phone" value={driver?.phone ?? "—"} />
            <KV label="Vehicle" value={driver?.vehicleNumber ?? "—"} />
            <KV label="Vehicle type" value={driver?.vehicleType ?? "—"} />
            <KV label="Licence #" value={driver?.licenseNumber ?? "—"} />
            <KV label="Hospital / org" value={driver?.hospitalName ?? "—"} />
          </div>
        </section>

        <section className="assess-section">
          <h2>Field Assessment</h2>
          {a ? (
            <>
              <div className="muted small" style={{ marginBottom: 12 }}>
                Recorded {a.recordedAt ? `on ${formatIST(String(a.recordedAt))}` : "(time not stamped)"} by paramedic.
              </div>
              {a.immediateRisk ? (
                <div className="risk-banner">🚨 IMMEDIATE RISK TO LIFE flagged by paramedic on scene.</div>
              ) : null}
              <div className="grid">
                <KV label="Consciousness" value={prettyAssessmentValue("consciousness", a.consciousness)} />
                <KV label="Breathing" value={prettyAssessmentValue("breathing", a.breathing)} />
                <KV label="Pulse" value={prettyAssessmentValue("pulse", a.pulse)} />
                <KV label="Bleeding severity" value={prettyAssessmentValue("bleeding", a.bleedingSeverity ?? a.bleeding)} />
                <KV label="Paramedic notes" value={a.notes ?? "—"} fullWidth />
              </div>
            </>
          ) : (
            <div className="muted">
              No assessment recorded yet for this booking.
            </div>
          )}
        </section>

        <footer className="assess-footer">
          <div>
            Generated {formatIST(new Date().toISOString())} · Internal medical record · Jeevan Rakshak
          </div>
          <div className="muted small">
            This document contains confidential patient information. Share only with treating clinicians.
          </div>
        </footer>
      </div>
    </div>
  );
}

function KV({ label, value, fullWidth }: { label: string; value: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div className={fullWidth ? "kv kv-full" : "kv"}>
      <div className="kv-label">{label}</div>
      <div className="kv-value">{value}</div>
    </div>
  );
}

function prettyAssessmentValue(field: string, v: unknown): string {
  if (v == null || v === "") return "—";
  const s = String(v);
  if (field === "consciousness") {
    switch (s) {
      case "alert": return "Alert";
      case "responsive_to_voice": return "Responds to voice";
      case "responsive_to_pain": return "Responds to pain";
      case "unconscious": return "Unconscious";
    }
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const cssBlock = `
.assess-page {
  background: #F3F4F6;
  min-height: 100vh;
  padding: 32px 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #0F172A;
}
.assess-toolbar {
  max-width: 800px;
  margin: 0 auto 12px;
  padding: 0 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.assess-toolbar a {
  color: #1E5EFF;
  text-decoration: none;
  font-size: 13px;
}
.assess-doc {
  max-width: 800px;
  margin: 0 auto;
  background: #fff;
  padding: 36px 44px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.assess-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #0F172A;
  padding-bottom: 14px;
  margin-bottom: 18px;
}
.assess-header h1 {
  margin: 0 0 4px;
  font-size: 24px;
}
.brand {
  text-align: right;
}
.brand-name {
  font-weight: 700;
  color: #DC2626;
  font-size: 16px;
}
.assess-section {
  margin: 18px 0;
}
.assess-section h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #64748B;
  border-bottom: 1px solid #E2E8F0;
  padding-bottom: 6px;
  margin: 0 0 12px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 24px;
}
.kv-full { grid-column: 1 / -1; }
.kv-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #64748B;
  margin-bottom: 2px;
}
.kv-value {
  font-size: 13.5px;
  font-weight: 500;
  color: #0F172A;
  word-break: break-word;
}
.muted { color: #64748B; }
.small { font-size: 11px; }
.risk-banner {
  background: rgba(220, 38, 38, 0.08);
  border-left: 4px solid #DC2626;
  color: #DC2626;
  font-weight: 700;
  padding: 10px 14px;
  border-radius: 4px;
  margin-bottom: 14px;
}
.assess-footer {
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid #E2E8F0;
  font-size: 11px;
  color: #64748B;
}
@media print {
  .assess-page { background: #fff; padding: 0; }
  .print-hide { display: none !important; }
  .assess-doc { box-shadow: none; max-width: 100%; padding: 0; }
  /* Collapse the admin layout chrome so only the assessment document
     ends up on the printed page. */
  .shell .sidebar { display: none !important; }
  .shell .content { padding: 0 !important; margin: 0 !important; }
  .shell { display: block !important; }
}
`;
