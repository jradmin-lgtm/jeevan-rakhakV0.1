import React from "react";
import { notFound } from "next/navigation";
import { adminFetch } from "../../../../../lib/adminFetch";
import { formatIST } from "../../../../../lib/dates";
import { prettyEmergency, prettyStatus } from "../../../../../lib/status";
import { resolveAmountPaid } from "../../../../../lib/fare";
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
 * Trip receipt — printable A4 layout patients/hospitals can save as PDF for
 * their records. Surfaced from the bookings list via "📄 Receipt" link on
 * COMPLETED rows; reachable for any booking via the URL directly.
 *
 * Mirrors the existing /assessment route (admin sidebar collapses via
 * @media print; PrintButton triggers window.print()). No server-side PDF
 * generation — Render's free tier can't host headless Chromium.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getBooking(id);
  if (!data) notFound();
  const { booking, user, driver } = data;
  const paid = resolveAmountPaid(booking);
  const fare = booking.fareEstimateInr ?? booking.fareFinalInr ?? 0;
  const discount = booking.discountInr ?? 0;

  return (
    <div className="rcpt-page">
      <style>{cssBlock}</style>
      <div className="rcpt-toolbar print-hide">
        <a href={`/bookings/${id}`}>← Back to booking</a>
        <PrintButton />
      </div>

      <div className="rcpt-doc">
        <header className="rcpt-header">
          <div>
            <div className="brand-name">Jeevan Rakshak</div>
            <div className="muted small">Emergency Ambulance Service · Receipt</div>
          </div>
          <div className="rcpt-meta">
            <div><strong>Booking</strong> #{booking.displayId ?? booking.id.slice(0, 8) + "…"}</div>
            <div className="muted small">{formatIST(booking.createdAt)}</div>
            <div className="muted small">Status: {prettyStatus(booking.status)}</div>
          </div>
        </header>

        <section className="rcpt-section">
          <h2>Trip details</h2>
          <div className="grid">
            <KV label="Emergency type" value={prettyEmergency(booking.emergencyType)} />
            <KV label="Booked on" value={formatIST(booking.createdAt)} />
            <KV label="Completed at" value={booking.completedAt ? formatIST(booking.completedAt) : (booking.status === "COMPLETED" ? "—" : "Not completed")} />
            <KV label="Ride OTP" value={booking.rideOtpCode ?? "—"} />
            <KV label="Pickup" value={booking.pickupAddress ?? `${booking.pickupLat}, ${booking.pickupLng}`} fullWidth />
            <KV label="Drop / hospital" value={booking.dropAddress ?? "Not specified"} fullWidth />
          </div>
        </section>

        <section className="rcpt-section">
          <h2>Patient</h2>
          <div className="grid">
            <KV label="Name" value={booking.patientName ?? user?.name ?? "—"} />
            <KV label="Phone" value={user?.phone ?? "—"} />
            <KV label="Age" value={booking.patientAge ? `${booking.patientAge} years` : "—"} />
            <KV
              label="Gender"
              value={
                booking.patientGender === "M" ? "Male"
                : booking.patientGender === "F" ? "Female"
                : booking.patientGender === "O" ? "Other"
                : "—"
              }
            />
            <KV label="Blood group" value={user?.bloodGroup ?? "—"} />
            <KV label="Allergies" value={user?.allergies ?? "—"} />
            <KV label="Emergency contact" value={user?.emergencyContact ?? "—"} fullWidth />
          </div>
        </section>

        <section className="rcpt-section">
          <h2>Ambulance & driver</h2>
          {driver ? (
            <div className="grid">
              <KV label="Driver" value={driver.name ?? "—"} />
              <KV label="Phone" value={driver.phone ?? "—"} />
              <KV label="Vehicle number" value={driver.vehicleNumber ?? "—"} />
              <KV label="Vehicle type" value={driver.vehicleType ?? "—"} />
              <KV label="Hospital / org" value={driver.hospitalName ?? "—"} />
              <KV label="Driver rating" value={`${(driver.rating ?? 5).toFixed(1)} / 5 ★`} />
            </div>
          ) : (
            <div className="muted">No driver was assigned to this booking.</div>
          )}
        </section>

        <section className="rcpt-section">
          <h2>Charges</h2>
          <table className="rcpt-table">
            <tbody>
              <tr>
                <td>Fare (quoted)</td>
                <td className="amt">₹{fare}</td>
              </tr>
              {booking.couponCode ? (
                <tr>
                  <td>Coupon applied</td>
                  <td className="amt">{booking.couponCode}</td>
                </tr>
              ) : null}
              {discount > 0 ? (
                <tr>
                  <td>Discount</td>
                  <td className="amt success">− ₹{discount}</td>
                </tr>
              ) : null}
              {booking.fareFinalInr != null ? (
                <tr>
                  <td>App final</td>
                  <td className="amt">₹{booking.fareFinalInr}</td>
                </tr>
              ) : null}
              {paid.overridden ? (
                <tr>
                  <td>Admin override {booking.adminFareOverrideNote ? <span className="muted small">· {booking.adminFareOverrideNote}</span> : null}</td>
                  <td className="amt">₹{booking.adminFareOverrideInr}</td>
                </tr>
              ) : null}
              <tr className="total">
                <td><strong>Net Pay</strong></td>
                <td className="amt total-amt">
                  <strong>{paid.amount == null ? "—" : `₹${paid.amount}`}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="muted small" style={{ marginTop: 6 }}>
            {paid.overridden
              ? "Net Pay reflects the admin-recorded billing amount (e.g. hospital invoice or off-app settlement)."
              : paid.amount === 0
                ? "Free ride during pilot — no charge collected from the patient."
                : "Net Pay is the amount the patient was billed through the app."}
          </div>
        </section>

        {booking.rating || booking.ratingByDriver ? (
          <section className="rcpt-section">
            <h2>Ratings</h2>
            <div className="grid">
              <KV
                label="Patient rated driver"
                value={booking.rating
                  ? <>{"★".repeat(booking.rating)}<span className="muted">{"☆".repeat(5 - booking.rating)}</span></>
                  : "Not rated"}
              />
              <KV
                label="Driver rated patient"
                value={booking.ratingByDriver
                  ? <>{"★".repeat(booking.ratingByDriver)}<span className="muted">{"☆".repeat(5 - booking.ratingByDriver)}</span></>
                  : "Not rated"}
              />
              {booking.feedback ? <KV label="Patient feedback" value={`“${booking.feedback}”`} fullWidth /> : null}
              {booking.feedbackByDriver ? <KV label="Driver feedback" value={`“${booking.feedbackByDriver}”`} fullWidth /> : null}
            </div>
          </section>
        ) : null}

        <footer className="rcpt-footer">
          <div>Receipt generated {formatIST(new Date().toISOString())} · Internal record · Jeevan Rakshak</div>
          <div className="muted small">
            For queries, contact mobile 0581 258 2000 or email contact.jeevanrakshak@gmail.com — quote Booking
            #{booking.displayId ?? booking.id.slice(0, 8) + "…"}.
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

const cssBlock = `
.rcpt-page {
  background: #F3F4F6;
  min-height: 100vh;
  padding: 32px 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #0F172A;
}
.rcpt-toolbar {
  max-width: 800px;
  margin: 0 auto 12px;
  padding: 0 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rcpt-toolbar a {
  color: #1E5EFF;
  text-decoration: none;
  font-size: 13px;
}
.rcpt-doc {
  max-width: 800px;
  margin: 0 auto;
  background: #fff;
  padding: 36px 44px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.04);
}
.rcpt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #0F172A;
  padding-bottom: 14px;
  margin-bottom: 18px;
  gap: 24px;
}
.brand-name {
  font-weight: 800;
  font-size: 22px;
  color: #DC2626;
}
.rcpt-meta {
  text-align: right;
  font-size: 13px;
}
.rcpt-section {
  margin: 18px 0;
}
.rcpt-section h2 {
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
.rcpt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.rcpt-table td {
  padding: 8px 0;
  border-bottom: 1px solid #E2E8F0;
}
.rcpt-table .amt {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.rcpt-table .success { color: #059669; }
.rcpt-table .total td {
  border-top: 2px solid #0F172A;
  border-bottom: none;
  padding-top: 12px;
  font-size: 15px;
}
.rcpt-table .total-amt {
  font-size: 18px;
  font-weight: 700;
}
.muted { color: #64748B; }
.small { font-size: 11px; }
.rcpt-footer {
  margin-top: 28px;
  padding-top: 14px;
  border-top: 1px solid #E2E8F0;
  font-size: 11px;
  color: #64748B;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
@media print {
  .rcpt-page { background: #fff; padding: 0; }
  .print-hide { display: none !important; }
  .rcpt-doc { box-shadow: none; max-width: 100%; padding: 0; }
  .shell .sidebar { display: none !important; }
  .shell .content { padding: 0 !important; margin: 0 !important; }
  .shell { display: block !important; }
}
`;
