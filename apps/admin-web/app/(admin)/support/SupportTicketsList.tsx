"use client";

import React, { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";

// Snake_case rows straight off GET /api/v1/admin/tickets (joined with
// hospital name + driver name/vehicle + booking displayId for context).
type Ticket = {
  id: string;
  subject_type: string; // 'DRIVER' | 'RIDE' | 'GENERAL'
  message: string;
  status: string; // 'OPEN' | 'RESOLVED'
  created_at: string;
  resolved_at?: string | null;
  hospital_id?: string | null;
  hospital_name?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  driver_vehicle?: string | null;
  booking_id?: string | null;
  booking_display_id?: string | null;
};

type Filter = "OPEN" | "RESOLVED" | "ALL";

const SUBJECT_LABELS: Record<string, string> = {
  DRIVER: "Driver",
  RIDE: "Ride",
  GENERAL: "General"
};

function subjectBadge(t: Ticket): { label: string; bg: string; fg: string } {
  if (t.subject_type === "DRIVER") {
    return { label: "Driver", bg: "rgba(59,130,246,0.12)", fg: "#2563EB" };
  }
  if (t.subject_type === "RIDE") {
    return { label: "Ride", bg: "rgba(168,85,247,0.12)", fg: "#9333EA" };
  }
  return { label: SUBJECT_LABELS[t.subject_type] ?? t.subject_type, bg: "rgba(148,163,184,0.16)", fg: "var(--ink, #0F172A)" };
}

export function SupportTicketsList({
  initialTickets,
  apiBase
}: {
  initialTickets: Ticket[];
  apiBase: string;
}) {
  const [filter, setFilter] = useState<Filter>("OPEN");
  const [rows, setRows] = useState<Ticket[]>(initialTickets);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/tickets`);
        const data = await res.json();
        if (!alive) return;
        setRows(data.tickets ?? []);
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

  const openCount = rows.filter((r) => r.status === "OPEN").length;
  const resolvedCount = rows.filter((r) => r.status === "RESOLVED").length;

  const filtered = useMemo(() => {
    if (filter === "ALL") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  async function setStatus(t: Ticket, status: "OPEN" | "RESOLVED") {
    setBusyId(t.id);
    // Optimistic flip so the table reacts instantly; the 10s poll reconciles.
    setRows((prev) =>
      prev.map((r) =>
        r.id === t.id
          ? { ...r, status, resolved_at: status === "RESOLVED" ? new Date().toISOString() : null }
          : r
      )
    );
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("patch");
    } catch {
      // Roll the optimistic change back on failure.
      setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));
    } finally {
      setBusyId(null);
    }
  }

  function subjectLink(t: Ticket): React.ReactNode {
    if (t.subject_type === "DRIVER" && t.driver_id) {
      return (
        <a href={`/drivers/${t.driver_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
          {t.driver_name ?? "Driver"}
          {t.driver_vehicle ? <span className="muted"> · {t.driver_vehicle}</span> : null}
        </a>
      );
    }
    if (t.subject_type === "RIDE" && t.booking_id) {
      return (
        <a href={`/bookings/${t.booking_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
          #{t.booking_display_id ?? "—"}
        </a>
      );
    }
    return <span className="muted">—</span>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Help &amp; Support</h1>
          <p>{openCount} open · {resolvedCount} resolved · {rows.length} total</p>
        </div>
      </div>

      <div className="filter-bar">
        {(["OPEN", "RESOLVED", "ALL"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            style={{
              padding: "6px 16px",
              borderRadius: 999,
              border: "1px solid var(--border, #E2E8F0)",
              background: filter === f ? "var(--accent)" : "transparent",
              color: filter === f ? "#fff" : "var(--ink, #0F172A)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            {f === "OPEN" ? "Open" : f === "RESOLVED" ? "Resolved" : "All"}
            {f === "OPEN" ? ` (${openCount})` : f === "RESOLVED" ? ` (${resolvedCount})` : ` (${rows.length})`}
          </button>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} shown</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          No tickets in this view. When a hospital raises a concern or feedback from its portal, it lands here.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted, #64748B)" }}>
                <th style={th}>Time</th>
                <th style={th}>Hospital</th>
                <th style={th}>Subject</th>
                <th style={th}>Message</th>
                <th style={th}>Status</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const badge = subjectBadge(t);
                const isOpen = t.status === "OPEN";
                return (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--border, #E2E8F0)" }}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{formatIST(t.created_at)}</td>
                    <td style={td}>{t.hospital_name ?? "—"}</td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          background: badge.bg,
                          color: badge.fg,
                          marginRight: 8
                        }}
                      >
                        {badge.label}
                      </span>
                      {subjectLink(t)}
                    </td>
                    <td style={{ ...td, maxWidth: 420, whiteSpace: "pre-wrap" }}>{t.message}</td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          background: isOpen ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                          color: isOpen ? "#DC2626" : "#16A34A"
                        }}
                      >
                        {isOpen ? "Open" : "Resolved"}
                      </span>
                    </td>
                    <td style={td}>
                      <button
                        type="button"
                        disabled={busyId === t.id}
                        onClick={() => setStatus(t, isOpen ? "RESOLVED" : "OPEN")}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 8,
                          border: "1px solid var(--border, #E2E8F0)",
                          background: isOpen ? "var(--accent)" : "transparent",
                          color: isOpen ? "#fff" : "var(--ink, #0F172A)",
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: busyId === t.id ? "default" : "pointer",
                          opacity: busyId === t.id ? 0.6 : 1,
                          whiteSpace: "nowrap"
                        }}
                      >
                        {busyId === t.id ? "…" : isOpen ? "Mark resolved" : "Reopen"}
                      </button>
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
