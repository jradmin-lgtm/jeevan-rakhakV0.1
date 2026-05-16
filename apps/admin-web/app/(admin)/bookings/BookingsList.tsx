"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Source, SourceFilter } from "../SourceFilter";
import { adminFetch } from "../../../lib/adminFetch";

type Booking = {
  id: string;
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
  const [source, setSource] = useState<Source>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<Booking[]>(initialBookings);

  useEffect(() => {
    let alive = true;
    const fetchRows = async () => {
      try {
        const params = new URLSearchParams({ source });
        if (status !== "all") params.set("status", status);
        const res = await adminFetch(`${apiBase}/api/v1/admin/bookings?${params.toString()}`);
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
  }, [apiBase, source, status]);

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

  const realCount = rows.filter((r) => !r.isDemo).length;
  const demoCount = rows.filter((r) => r.isDemo).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Bookings</h1>
          <p>{rows.length} total · {realCount} real · {demoCount} demo</p>
        </div>
        <SourceFilter value={source} onChange={setSource} />
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
                <th>Source</th>
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
                filtered.map((b) => (
                  <tr key={b.id}>
                    <td className="mono">{b.id.slice(0, 8)}…</td>
                    <td className="mono muted">{new Date(b.createdAt).toLocaleString()}</td>
                    <td>{prettyEmergency(b.emergencyType)}</td>
                    <td>
                      <div>{b.pickupAddress ?? "—"}</div>
                      {b.dropAddress ? <div className="muted" style={{ fontSize: 12 }}>→ {b.dropAddress}</div> : null}
                    </td>
                    <td className="mono">₹{b.fareFinalInr ?? b.fareEstimateInr ?? "—"}</td>
                    <td>{b.rating ? "★".repeat(b.rating) : <span className="muted">—</span>}</td>
                    <td><span className={`pill ${b.status.toLowerCase()}`}>{prettyStatus(b.status)}</span></td>
                    <td>
                      {b.isDemo ? <span className="demo-flag">DEMO</span> : <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600, letterSpacing: 0.4 }}>REAL</span>}
                    </td>
                    <td>
                      <Link href={`/bookings/${b.id}`} style={{ color: "var(--accent)", fontSize: 12 }}>Open →</Link>
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
