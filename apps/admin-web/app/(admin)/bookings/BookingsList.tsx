"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";
import { downloadCsv } from "../../../lib/csv";
import { DateRangePicker, DateRange, Preset, presetToRange } from "../DateRange";
import { DeleteBookingButton } from "./DeleteBookingButton";

type Booking = {
  id: string;
  displayId?: string | null;
  emergencyType: string;
  status: string;
  pickupAddress?: string | null;
  dropAddress?: string | null;
  fareEstimateInr?: number | null;
  fareFinalInr?: number | null;
  rating?: number | null;
  createdAt: string;
  isDemo?: boolean;
};

const STATUSES = ["all", "REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP", "COMPLETED", "CANCELLED", "TIMED_OUT"];

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
      { header: "Fare (₹)", value: (b) => b.fareFinalInr ?? b.fareEstimateInr ?? "" },
      { header: "Rating", value: (b) => b.rating ?? "" }
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

      <div className="filter-bar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : prettyStatus(s)}
            </option>
          ))}
        </select>
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
                <th>Fare</th>
                <th>Rating</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 24, textAlign: "center" }}>
                    No bookings match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="mono"><strong>#{b.displayId ?? b.id.slice(0, 8) + "…"}</strong></td>
                    <td className="mono muted">{formatIST(b.createdAt)}</td>
                    <td>{prettyEmergency(b.emergencyType)}</td>
                    <td>
                      <div>{b.pickupAddress ?? "—"}</div>
                      {b.dropAddress ? <div className="muted" style={{ fontSize: 12 }}>→ {b.dropAddress}</div> : null}
                    </td>
                    <td className="mono">₹{b.fareFinalInr ?? b.fareEstimateInr ?? "—"}</td>
                    <td>{b.rating ? "★".repeat(b.rating) : <span className="muted">—</span>}</td>
                    <td><span className={`pill ${b.status.toLowerCase()}`}>{prettyStatus(b.status)}</span></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Link href={`/bookings/${b.id}`} style={{ color: "var(--accent)", fontSize: 12, marginRight: 8 }}>Open →</Link>
                      <DeleteBookingButton
                        bookingId={b.id}
                        apiBase={apiBase}
                        short
                        onDeleted={() => setRows((curr) => curr.filter((r) => r.id !== b.id))}
                      />
                    </td>
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
