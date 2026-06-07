"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";
import { downloadCsv } from "../../../lib/csv";
import { prettyStatus, shortStatus, prettyEmergency, assessmentBadge } from "../../../lib/status";
import { resolveAmountPaid, formatAmountPaid } from "../../../lib/fare";
import { DateRangePicker, DateRange, Preset, presetToRange } from "../DateRange";

type Booking = {
  id: string;
  displayId?: string | null;
  emergencyType: string;
  status: string;
  pickupAddress?: string | null;
  dropAddress?: string | null;
  fareEstimateInr?: number | null;
  fareFinalInr?: number | null;
  adminFareOverrideInr?: number | null;
  payableInr?: number | null;
  discountInr?: number | null;
  couponCode?: string | null;
  rating?: number | null;
  createdAt: string;
  isDemo?: boolean;
  paramedicAssessment?: Record<string, any> | null;
  // v1.2.2 — latest cancellation details folded in from the (removed)
  // standalone Cancellations view. snake_case to match the API row keys
  // (services/api-server admin.ts GET /admin/bookings). Null for non-cancelled.
  cancel_reason?: string | null;
  cancel_remarks?: string | null;
  cancel_outcome?: string | null;
};

const STATUSES = ["all", "REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP", "COMPLETED", "CANCELLED", "TIMED_OUT"];

// v1.2.2 — humanized driver-cancellation reason labels (folded in from the
// old CancellationsList). Keep in sync with the cancel reason codes the
// driver app submits.
const CANCEL_REASON_LABELS: Record<string, string> = {
  PATIENT_NOT_AVAILABLE: "Patient not at pickup",
  PATIENT_NOT_RESPONDING: "Patient not responding",
  VEHICLE_BREAKDOWN: "Vehicle breakdown / mechanical",
  TYRE_PUNCTURE: "Tyre puncture",
  CANNOT_REACH_PICKUP: "Can't reach pickup",
  OTHER: "Other"
};

function cancelReasonText(b: Booking): string {
  if (!b.cancel_reason) return "";
  const label = b.cancel_reason === "OTHER" ? "Other" : (CANCEL_REASON_LABELS[b.cancel_reason] ?? b.cancel_reason);
  // Surface driver remarks for EVERY reason (not just OTHER) — the backend
  // returns cancel_remarks for all cancellations.
  const r = (b.cancel_remarks ?? "").trim();
  return r ? `${label} · ${r}` : label;
}

const CANCEL_OUTCOME_LABELS: Record<string, string> = {
  RE_DISPATCHED: "Re-dispatched",
  CLOSED: "Closed"
};

export function BookingsList({ initialBookings, apiBase }: { initialBookings: Booking[]; apiBase: string }) {
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<Booking[]>(initialBookings);
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState<DateRange>(presetToRange("30d"));

  useEffect(() => {
    let alive = true;
    const fetchRows = async () => {
      try {
        const params = new URLSearchParams();
        if (status !== "all") params.set("status", status);
        if (range.since) params.set("since", range.since);
        if (range.until) params.set("until", range.until);
        const qs = params.toString();
        const res = await adminFetch(`${apiBase}/api/v1/admin/bookings${qs ? "?" + qs : ""}`);
        // The same-origin proxy resolves (not throws) a JSON error body on a
        // transient 401/502 cold start — skip this tick so a blip can't wipe
        // the live rows. A later good poll repaints them.
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setRows(data.bookings ?? []);
      } catch {
        /* keep last good */
      }
    };
    void fetchRows();
    const id = setInterval(fetchRows, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase, status, range.since, range.until]);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (b) =>
        (b.pickupAddress ?? "").toLowerCase().includes(q) ||
        (b.dropAddress ?? "").toLowerCase().includes(q) ||
        b.id.includes(q)
    );
  }, [rows, query]);

  const exportCsv = () => {
    downloadCsv(filtered, [
      { header: "Booking #", value: (b) => b.displayId ?? "" },
      { header: "Booking UUID", value: (b) => b.id },
      { header: "Created (IST)", value: (b) => formatIST(b.createdAt) },
      { header: "Emergency", value: (b) => prettyEmergency(b.emergencyType) },
      { header: "Status", value: (b) => prettyStatus(b.status) },
      { header: "Pickup", value: (b) => b.pickupAddress ?? "" },
      { header: "Drop", value: (b) => b.dropAddress ?? "" },
      { header: "Fare (₹)", value: (b) => b.fareEstimateInr ?? "" },
      { header: "Coupon", value: (b) => b.couponCode ?? "" },
      { header: "Discount (₹)", value: (b) => b.discountInr ?? "" },
      { header: "Net Pay (₹)", value: (b) => resolveAmountPaid(b).amount ?? "" },
      { header: "Override active", value: (b) => (resolveAmountPaid(b).overridden ? "yes" : "") },
      { header: "Rating", value: (b) => b.rating ?? "" },
      { header: "Paramedic assessment", value: (b) => assessmentBadge(b.status, b.paramedicAssessment).label }
    ], "jr-bookings");
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bookings</h1>
          <p>{rows.length} in range</p>
        </div>
        <button onClick={exportCsv} style={csvBtnStyle}>⬇ Download CSV</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <DateRangePicker
          preset={preset}
          range={range}
          onChange={(p, r) => { setPreset(p); setRange(r); }}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {STATUSES.map((s) => {
          const active = status === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              style={statusChipStyle(active)}
            >
              {s === "all" ? "All" : shortStatus(s)}
            </button>
          );
        })}
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search pickup, drop, or booking id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} match</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Created</th>
                <th>Emergency</th>
                <th>Pickup → Drop</th>
                <th>Amount Paid</th>
                <th>Rating</th>
                <th>Status</th>
                <th>Paramedic</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted" style={{ padding: 24, textAlign: "center" }}>
                    No bookings match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => {
                  const badge = assessmentBadge(b.status, b.paramedicAssessment);
                  const paid = resolveAmountPaid(b);
                  const isCompleted = b.status === "COMPLETED";
                  const isCancelled = b.status === "CANCELLED";
                  const reasonLabel = isCancelled ? cancelReasonText(b) : "";
                  return (
                    <tr key={b.id}>
                      <td className="mono"><strong>#{b.displayId ?? "-"}</strong></td>
                      <td className="mono muted">{formatIST(b.createdAt)}</td>
                      <td>{prettyEmergency(b.emergencyType)}</td>
                      <td>
                        <div>{b.pickupAddress ?? "-"}</div>
                        {b.dropAddress ? <div className="muted" style={{ fontSize: 12 }}>→ {b.dropAddress}</div> : null}
                      </td>
                      <td className="mono">
                        {formatAmountPaid(b)}
                        {paid.overridden ? (
                          <span title="Admin override" style={{ marginLeft: 6, fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "rgba(245, 158, 11, 0.15)", color: "#B45309", fontWeight: 700 }}>OR</span>
                        ) : null}
                        {b.couponCode && !paid.overridden ? (
                          <div className="muted" style={{ fontSize: 11 }}>{b.couponCode}</div>
                        ) : null}
                      </td>
                      <td>{b.rating ? "★".repeat(b.rating) : <span className="muted">-</span>}</td>
                      <td>
                        <span className={`pill ${b.status.toLowerCase()}`}>{prettyStatus(b.status)}</span>
                        {isCancelled && b.cancel_outcome ? (
                          <span
                            style={{
                              marginLeft: 6, fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                              background: b.cancel_outcome === "RE_DISPATCHED" ? "rgba(37,99,235,0.12)" : "rgba(148,163,184,0.18)",
                              color: b.cancel_outcome === "RE_DISPATCHED" ? "#1D4ED8" : "#475569"
                            }}
                          >
                            {CANCEL_OUTCOME_LABELS[b.cancel_outcome] ?? b.cancel_outcome}
                          </span>
                        ) : null}
                        {isCancelled && reasonLabel ? (
                          <div className="muted" style={{ fontSize: 11, marginTop: 4, maxWidth: 240 }}>
                            {reasonLabel}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {badge.variant === "na" ? (
                          <span className="muted">-</span>
                        ) : (
                          <span style={assessmentChipStyle(badge.variant)}>{badge.label}</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <Link href={`/bookings/${b.id}`} style={{ color: "var(--accent)", fontSize: 12 }}>Open →</Link>
                          {isCompleted ? (
                            <Link
                              href={`/bookings/${b.id}/receipt`}
                              target="_blank"
                              title="Open trip receipt · print or save as PDF"
                              style={{ color: "var(--ink)", fontSize: 11, fontWeight: 600 }}
                            >
                              📄 Receipt
                            </Link>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const csvBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border, #E2E8F0)",
  color: "var(--ink, #0F172A)",
  padding: "8px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};

function statusChipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    border: `1px solid ${active ? "var(--accent, #1E5EFF)" : "var(--border, #E2E8F0)"}`,
    background: active ? "var(--accent, #1E5EFF)" : "transparent",
    color: active ? "#FFFFFF" : "var(--ink, #0F172A)"
  };
}

function assessmentChipStyle(variant: "submitted" | "risk" | "awaiting" | "na"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    whiteSpace: "nowrap"
  };
  if (variant === "submitted") return { ...base, background: "rgba(16,185,129,0.10)", color: "#059669" };
  if (variant === "risk") return { ...base, background: "rgba(220,38,38,0.10)", color: "#DC2626" };
  if (variant === "awaiting") return { ...base, background: "rgba(245,158,11,0.10)", color: "#B45309" };
  return { ...base, color: "var(--muted)" };
}
