"use client";

import React, { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";

type Cancellation = {
  id: string;
  reason_code: string;
  remarks?: string | null;
  outcome: string;
  created_at: string;
  booking_display_id?: string | null;
  driver_name?: string | null;
  ambulance_number?: string | null;
};

const REASON_LABELS: Record<string, string> = {
  PATIENT_NOT_AVAILABLE: "Patient not at pickup",
  PATIENT_NOT_RESPONDING: "Patient not responding",
  VEHICLE_BREAKDOWN: "Vehicle breakdown / mechanical",
  TYRE_PUNCTURE: "Tyre puncture",
  CANNOT_REACH_PICKUP: "Can't reach pickup",
  OTHER: "Other"
};

function reasonText(c: Cancellation): string {
  if (c.reason_code === "OTHER") {
    const r = (c.remarks ?? "").trim();
    return r ? `Other — ${r}` : "Other";
  }
  return REASON_LABELS[c.reason_code] ?? c.reason_code;
}

function outcomeBadge(outcome: string): { label: string; bg: string; fg: string } {
  if (outcome === "RE_DISPATCHED") {
    return { label: "Re-dispatched", bg: "rgba(59,130,246,0.12)", fg: "#2563EB" };
  }
  if (outcome === "CLOSED") {
    return { label: "Closed", bg: "rgba(239,68,68,0.12)", fg: "#DC2626" };
  }
  return { label: outcome, bg: "rgba(148,163,184,0.12)", fg: "var(--ink, #0F172A)" };
}

export function CancellationsList({
  initialCancellations,
  apiBase
}: {
  initialCancellations: Cancellation[];
  apiBase: string;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Cancellation[]>(initialCancellations);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/cancellations`);
        const data = await res.json();
        if (!alive) return;
        setRows(data.cancellations ?? []);
      } catch {
        /* keep last good */
      }
    };
    void tick();
    const id = setInterval(tick, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase]);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((c) =>
      (c.booking_display_id ?? "").toLowerCase().includes(q) ||
      (c.driver_name ?? "").toLowerCase().includes(q) ||
      (c.ambulance_number ?? "").toLowerCase().includes(q) ||
      (c.remarks ?? "").toLowerCase().includes(q) ||
      reasonText(c).toLowerCase().includes(q)
    );
  }, [rows, query]);

  const reDispatched = rows.filter((r) => r.outcome === "RE_DISPATCHED").length;
  const closed = rows.filter((r) => r.outcome === "CLOSED").length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Cancellations</h1>
          <p>{rows.length} total · {reDispatched} re-dispatched · {closed} closed</p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search ride id, driver, ambulance, reason…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} match</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          No cancellations to show. When a driver cancels a ride, it is logged here.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted, #64748B)" }}>
                <th style={th}>Ride ID</th>
                <th style={th}>Driver</th>
                <th style={th}>Ambulance #</th>
                <th style={th}>Time</th>
                <th style={th}>Reason</th>
                <th style={th}>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const badge = outcomeBadge(c.outcome);
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border, #E2E8F0)" }}>
                    <td style={td}>
                      <span style={{ fontWeight: 600 }}>
                        #{c.booking_display_id ?? "—"}
                      </span>
                    </td>
                    <td style={td}>{c.driver_name ?? "—"}</td>
                    <td style={td}>{c.ambulance_number ?? "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{formatIST(c.created_at)}</td>
                    <td style={{ ...td, maxWidth: 360 }}>{reasonText(c)}</td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          background: badge.bg,
                          color: badge.fg
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  fontWeight: 600
};

const td: React.CSSProperties = {
  padding: "10px 14px",
  color: "var(--ink, #0F172A)",
  verticalAlign: "top"
};
