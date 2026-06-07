"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";

// Snake_case rows straight off GET /api/v1/admin/tickets (joined with
// hospital name + driver name/vehicle + raiser name + booking displayId for
// context). v1.2.4 added source/priority/severity/resolved_by + a
// per-ticket message_count and the 3-way raiser fields.
type Ticket = {
  id: string;
  subject_type: string; // 'DRIVER' | 'RIDE' | 'GENERAL'
  category?: string | null; // 'ISSUE' | 'FEEDBACK' (v1.2.2; defaults to ISSUE)
  source?: string | null; // 'HOSPITAL' | 'DRIVER' | 'USER' (v1.2.4; defaults HOSPITAL)
  priority?: string | null; // 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' (v1.2.4)
  severity?: string | null; // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' (v1.2.4)
  message: string;
  status: string; // 'OPEN' | 'RESOLVED'
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  hospital_id?: string | null;
  hospital_name?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  driver_vehicle?: string | null;
  raiser_user_id?: string | null;
  raiser_user_name?: string | null;
  raiser_driver_id?: string | null;
  raiser_driver_name?: string | null;
  raiser_driver_vehicle?: string | null;
  booking_id?: string | null;
  booking_display_id?: string | null;
  message_count?: number | null;
};

type StatusFilter = "OPEN" | "RESOLVED" | "ALL";
type CategoryFilter = "ALL" | "ISSUE" | "FEEDBACK";
type SourceFilter = "ALL" | "HOSPITAL" | "DRIVER" | "USER";
type PriorityFilter = "ALL" | "LOW" | "NORMAL" | "HIGH" | "URGENT";
type SeverityFilter = "ALL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const SUBJECT_LABELS: Record<string, string> = {
  DRIVER: "Driver",
  RIDE: "Ride",
  GENERAL: "General"
};

// v1.2.2: rows with no category (pre-migration safety) read as ISSUE, matching
// the backend column default.
function ticketCategory(t: Ticket): "ISSUE" | "FEEDBACK" {
  return t.category === "FEEDBACK" ? "FEEDBACK" : "ISSUE";
}

// v1.2.4: rows with no source (pre-migration safety) read as HOSPITAL, matching
// the backend column default.
function ticketSource(t: Ticket): "HOSPITAL" | "DRIVER" | "USER" {
  if (t.source === "DRIVER") return "DRIVER";
  if (t.source === "USER") return "USER";
  return "HOSPITAL";
}

function ticketPriority(t: Ticket): "LOW" | "NORMAL" | "HIGH" | "URGENT" {
  const p = (t.priority ?? "NORMAL").toUpperCase();
  return p === "LOW" || p === "HIGH" || p === "URGENT" ? (p as any) : "NORMAL";
}

function ticketSeverity(t: Ticket): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  const s = (t.severity ?? "MEDIUM").toUpperCase();
  return s === "LOW" || s === "HIGH" || s === "CRITICAL" ? (s as any) : "MEDIUM";
}

function categoryBadge(t: Ticket): { label: string; bg: string; fg: string } {
  if (ticketCategory(t) === "FEEDBACK") {
    return { label: "Feedback", bg: "rgba(245,158,11,0.14)", fg: "#B45309" };
  }
  return { label: "Issue", bg: "rgba(99,102,241,0.12)", fg: "#4F46E5" };
}

function sourceBadge(t: Ticket): { label: string; bg: string; fg: string } {
  const src = ticketSource(t);
  if (src === "DRIVER") {
    return { label: "Driver", bg: "rgba(59,130,246,0.12)", fg: "#2563EB" };
  }
  if (src === "USER") {
    return { label: "User", bg: "rgba(16,185,129,0.12)", fg: "#059669" };
  }
  return { label: "Hospital", bg: "rgba(139,92,246,0.12)", fg: "#7C3AED" };
}

function subjectBadge(t: Ticket): { label: string; bg: string; fg: string } {
  if (t.subject_type === "DRIVER") {
    return { label: "Driver", bg: "rgba(59,130,246,0.12)", fg: "#2563EB" };
  }
  if (t.subject_type === "RIDE") {
    return { label: "Ride", bg: "rgba(168,85,247,0.12)", fg: "#9333EA" };
  }
  return { label: SUBJECT_LABELS[t.subject_type] ?? t.subject_type, bg: "rgba(148,163,184,0.16)", fg: "var(--ink, #0F172A)" };
}

// Colored priority flag — Urgent red, High orange, Normal slate, Low grey.
function priorityFlag(t: Ticket): { label: string; bg: string; fg: string } {
  switch (ticketPriority(t)) {
    case "URGENT":
      return { label: "Urgent", bg: "rgba(239,68,68,0.14)", fg: "#DC2626" };
    case "HIGH":
      return { label: "High", bg: "rgba(249,115,22,0.14)", fg: "#EA580C" };
    case "LOW":
      return { label: "Low", bg: "rgba(148,163,184,0.16)", fg: "#64748B" };
    default:
      return { label: "Normal", bg: "rgba(100,116,139,0.12)", fg: "#475569" };
  }
}

function severityChip(t: Ticket): { label: string; bg: string; fg: string } {
  switch (ticketSeverity(t)) {
    case "CRITICAL":
      return { label: "Critical", bg: "rgba(190,18,60,0.12)", fg: "#BE123C" };
    case "HIGH":
      return { label: "High", bg: "rgba(217,119,6,0.12)", fg: "#B45309" };
    case "LOW":
      return { label: "Low", bg: "rgba(148,163,184,0.14)", fg: "#64748B" };
    default:
      return { label: "Medium", bg: "rgba(14,165,233,0.12)", fg: "#0284C7" };
  }
}

// Build the AND-combined query string the API expects. Empty/ALL values are
// dropped so the default (no-filter) call stays the bare base URL.
function buildQuery(f: {
  status: StatusFilter;
  category: CategoryFilter;
  source: SourceFilter;
  priority: PriorityFilter;
  severity: SeverityFilter;
  from: string;
  to: string;
}): string {
  const params = new URLSearchParams();
  if (f.status !== "ALL") params.set("status", f.status);
  if (f.category !== "ALL") params.set("category", f.category);
  if (f.source !== "ALL") params.set("source", f.source);
  if (f.priority !== "ALL") params.set("priority", f.priority);
  if (f.severity !== "ALL") params.set("severity", f.severity);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function SupportTicketsList({
  initialTickets,
  apiBase
}: {
  initialTickets: Ticket[];
  apiBase: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("OPEN");
  const [category, setCategory] = useState<CategoryFilter>("ALL");
  const [source, setSource] = useState<SourceFilter>("ALL");
  const [priority, setPriority] = useState<PriorityFilter>("ALL");
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [rows, setRows] = useState<Ticket[]>(initialTickets);
  // Distinct fetch-failure flag so a network/API error isn't painted as an
  // empty result (which would falsely read "no tickets in this view").
  const [loadError, setLoadError] = useState(false);
  // Universe open/resolved tallies (ISSUE-scoped) for the header — independent
  // of the active filters, matching the nav badge + dashboard stat semantics.
  const [tally, setTally] = useState<{ open: number; resolved: number }>({ open: 0, resolved: 0 });
  const [busyId, setBusyId] = useState<string | null>(null);
  // Pause the poll's setRows while a row toggle (PATCH) is in flight so a poll
  // landing mid-mutation can't clobber the optimistic row. Mirrors
  // TicketDetailLive's mutatingRef. A later good poll reconciles either way.
  const mutatingRef = useRef(false);

  const query = useMemo(
    () => buildQuery({ status, category, source, priority, severity, from, to }),
    [status, category, source, priority, severity, from, to]
  );

  // Live poll: the API does the filtering (AND-combined) + newest-first +
  // 500 cap, so we just paint the rows it hands back. Re-subscribes when the
  // query string changes; cleared on unmount.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      // Don't repaint rows from a poll that landed mid-mutation — it would
      // overwrite the optimistic toggle. Skip this tick; the next poll after
      // the PATCH settles reconciles the row.
      if (mutatingRef.current) return;
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/tickets${query}`);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const data = await res.json();
        if (!alive || mutatingRef.current) return;
        setRows(data.tickets ?? []);
        setLoadError(false);
      } catch {
        // Keep last good rows, but flag the failure so the empty view doesn't
        // masquerade as "no tickets". A later good poll clears the flag.
        if (alive) setLoadError(true);
      }
    };
    void tick();
    const id = setInterval(tick, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase, query]);

  // Header tallies poll the lightweight ISSUE-scoped count endpoint so the
  // open/resolved numbers reflect the whole universe, not the filtered view.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/count`);
        const data = await res.json();
        if (!alive) return;
        setTally({ open: Number(data.open ?? 0), resolved: Number(data.resolved ?? 0) });
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

  async function setTicketStatus(t: Ticket, next: "OPEN" | "RESOLVED") {
    setBusyId(t.id);
    // Block the poll's setRows for the duration of the round-trip so an
    // in-flight poll can't overwrite the optimistic flip below.
    mutatingRef.current = true;
    // Optimistic flip so the table reacts instantly; the 10s poll reconciles.
    setRows((prev) =>
      prev.map((r) =>
        r.id === t.id
          ? { ...r, status: next, resolved_at: next === "RESOLVED" ? new Date().toISOString() : null }
          : r
      )
    );
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) throw new Error("patch");
    } catch {
      // Roll the optimistic change back on failure. (Note: resolving an issue
      // without an admin reply is rejected by the API's resolve-gate; the
      // ticket card is the place to reply + close — this row toggle stays as a
      // quick reopen/resolve and reconciles on the next poll.)
      setRows((prev) => prev.map((r) => (r.id === t.id ? t : r)));
    } finally {
      mutatingRef.current = false;
      setBusyId(null);
    }
  }

  function subjectLink(t: Ticket): React.ReactNode {
    if (t.subject_type === "DRIVER" && t.driver_id) {
      return (
        <a
          href={`/drivers/${t.driver_id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--accent)", textDecoration: "none" }}
        >
          {t.driver_name ?? "Driver"}
          {t.driver_vehicle ? <span className="muted"> · {t.driver_vehicle}</span> : null}
        </a>
      );
    }
    if (t.subject_type === "RIDE" && t.booking_id) {
      return (
        <a
          href={`/bookings/${t.booking_id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--accent)", textDecoration: "none" }}
        >
          #{t.booking_display_id ?? "—"}
        </a>
      );
    }
    return <span className="muted">—</span>;
  }

  // Who raised the ticket, picked by source (hospital name / driver / user).
  function raiserLabel(t: Ticket): React.ReactNode {
    const src = ticketSource(t);
    if (src === "DRIVER") {
      const name = t.raiser_driver_name ?? "Driver";
      return (
        <span>
          {name}
          {t.raiser_driver_vehicle ? <span className="muted"> · {t.raiser_driver_vehicle}</span> : null}
        </span>
      );
    }
    if (src === "USER") {
      return <span>{t.raiser_user_name ?? "User"}</span>;
    }
    return <span>{t.hospital_name ?? "—"}</span>;
  }

  const selectStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1px solid var(--border, #CBD5E1)",
    borderRadius: 6,
    fontSize: 13,
    background: "transparent",
    color: "var(--ink, #0F172A)"
  };
  const fieldLabel: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 10,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: 0.4
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Help &amp; Support</h1>
          <p>{tally.open} open · {tally.resolved} resolved · {rows.length} shown</p>
        </div>
      </div>

      {/* Status chips */}
      <div className="filter-bar">
        {(["OPEN", "RESOLVED", "ALL"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatus(f)}
            style={{
              padding: "6px 16px",
              borderRadius: 999,
              border: "1px solid var(--border, #E2E8F0)",
              background: status === f ? "var(--accent)" : "transparent",
              color: status === f ? "#fff" : "var(--ink, #0F172A)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            {f === "OPEN" ? "Open" : f === "RESOLVED" ? "Resolved" : "All"}
          </button>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>{rows.length} shown</span>
      </div>

      {/* Category chips */}
      <div className="filter-bar">
        {(["ALL", "ISSUE", "FEEDBACK"] as CategoryFilter[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            style={{
              padding: "6px 16px",
              borderRadius: 999,
              border: "1px solid var(--border, #E2E8F0)",
              background: category === c ? "var(--accent)" : "transparent",
              color: category === c ? "#fff" : "var(--ink, #0F172A)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            {c === "ALL" ? "All" : c === "ISSUE" ? "Issues" : "Feedback"}
          </button>
        ))}
      </div>

      {/* Source / priority / severity / date range */}
      <div className="filter-bar" style={{ alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <label style={fieldLabel}>
          Source
          <select value={source} onChange={(e) => setSource(e.target.value as SourceFilter)} style={selectStyle}>
            <option value="ALL">All</option>
            <option value="HOSPITAL">Hospital</option>
            <option value="DRIVER">Driver</option>
            <option value="USER">User</option>
          </select>
        </label>
        <label style={fieldLabel}>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as PriorityFilter)} style={selectStyle}>
            <option value="ALL">All</option>
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </label>
        <label style={fieldLabel}>
          Severity
          <select value={severity} onChange={(e) => setSeverity(e.target.value as SeverityFilter)} style={selectStyle}>
            <option value="ALL">All</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </label>
        <label style={fieldLabel}>
          From
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={selectStyle} />
        </label>
        <label style={fieldLabel}>
          To
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={selectStyle} />
        </label>
        {(source !== "ALL" || priority !== "ALL" || severity !== "ALL" || from || to) ? (
          <button
            type="button"
            onClick={() => {
              setSource("ALL");
              setPriority("ALL");
              setSeverity("ALL");
              setFrom("");
              setTo("");
            }}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid var(--border, #E2E8F0)",
              background: "transparent",
              color: "var(--muted, #64748B)",
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer"
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {rows.length === 0 && loadError ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--danger, #DC2626)" }}>
          Couldn’t load tickets — retrying every 10s. Check your connection; the list will refresh once it reconnects.
        </div>
      ) : rows.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          No tickets in this view. Hospital, driver and user tickets all land here — adjust the filters above to widen the view.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted, #64748B)" }}>
                <th style={th}>Time</th>
                <th style={th}>Source</th>
                <th style={th}>Raised by</th>
                <th style={th}>Category</th>
                <th style={th}>Priority</th>
                <th style={th}>Severity</th>
                <th style={th}>Subject</th>
                <th style={th}>Message</th>
                <th style={th}>Status</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const src = sourceBadge(t);
                const catBadge = categoryBadge(t);
                const prio = priorityFlag(t);
                const sev = severityChip(t);
                const subj = subjectBadge(t);
                const isOpen = t.status === "OPEN";
                const msgCount = Number(t.message_count ?? 0);
                return (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`/support/${t.id}`)}
                    style={{ borderTop: "1px solid var(--border, #E2E8F0)", cursor: "pointer" }}
                  >
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{formatIST(t.created_at)}</td>
                    <td style={td}>
                      <span style={chipStyle(src.bg, src.fg)}>{src.label}</span>
                    </td>
                    <td style={{ ...td, maxWidth: 200, overflowWrap: "anywhere" }}>{raiserLabel(t)}</td>
                    <td style={td}>
                      <span style={chipStyle(catBadge.bg, catBadge.fg)}>{catBadge.label}</span>
                    </td>
                    <td style={td}>
                      <span style={chipStyle(prio.bg, prio.fg)}>{prio.label}</span>
                    </td>
                    <td style={td}>
                      <span style={chipStyle(sev.bg, sev.fg)}>{sev.label}</span>
                    </td>
                    <td style={td}>
                      <span style={{ ...chipStyle(subj.bg, subj.fg), marginRight: 8 }}>
                        {subj.label}
                      </span>
                      {subjectLink(t)}
                    </td>
                    <td style={{ ...td, maxWidth: 360, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                      {t.message}
                      {msgCount > 1 ? (
                        <span className="muted" style={{ display: "block", fontSize: 11, marginTop: 4 }}>
                          {msgCount} messages in thread
                        </span>
                      ) : null}
                    </td>
                    <td style={td}>
                      <span
                        style={chipStyle(
                          isOpen ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                          isOpen ? "#DC2626" : "#16A34A"
                        )}
                      >
                        {isOpen ? "Open" : "Resolved"}
                      </span>
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                        <a
                          href={`/support/${t.id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
                        >
                          Open →
                        </a>
                        {/* Resolving requires a reply + closer name (the API
                           resolve-gate), so it happens in the ticket card via
                           "Open →". The inline action is only a quick Reopen for
                           already-resolved tickets (allowed without a reply). */}
                        {!isOpen ? (
                          <button
                            type="button"
                            disabled={busyId === t.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void setTicketStatus(t, "OPEN");
                            }}
                            style={{
                              padding: "5px 12px",
                              borderRadius: 8,
                              border: "1px solid var(--border, #E2E8F0)",
                              background: "transparent",
                              color: "var(--ink, #0F172A)",
                              fontWeight: 600,
                              fontSize: 12,
                              cursor: busyId === t.id ? "default" : "pointer",
                              opacity: busyId === t.id ? 0.6 : 1,
                              whiteSpace: "nowrap"
                            }}
                          >
                            {busyId === t.id ? "…" : "Reopen"}
                          </button>
                        ) : null}
                      </div>
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

function chipStyle(bg: string, fg: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: bg,
    color: fg,
    whiteSpace: "nowrap"
  };
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
