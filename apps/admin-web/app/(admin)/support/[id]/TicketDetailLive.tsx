"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../../lib/adminFetch";
import { formatIST, formatTimeIST } from "../../../../lib/dates";

// Snake_case rows straight off GET /api/v1/admin/tickets/:id (joined with the
// hospital / driver / user / booking context, picked by source). Mirrors the
// list row shape (SupportTicketsList.tsx) + the detail-only fields.
type Ticket = {
  id: string;
  subject_type: string; // 'DRIVER' | 'RIDE' | 'GENERAL'
  category?: string | null; // 'ISSUE' | 'FEEDBACK'
  source?: string | null; // 'HOSPITAL' | 'DRIVER' | 'USER' (defaults HOSPITAL)
  priority?: string | null; // 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  severity?: string | null; // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
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
};

// A row off support_ticket_messages — author_role drives bubble alignment.
type TicketMessage = {
  id: string;
  ticket_id: string;
  author_role: string; // 'ADMIN' | 'HOSPITAL' | 'DRIVER' | 'USER'
  author_name?: string | null;
  body: string;
  created_at: string;
};

type Detail = {
  ticket: Ticket;
  messages: TicketMessage[];
  raiser: { role: string; name: string | null; detail: string | null };
};

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const POLL_MS = 10000;
// localStorage key for the remembered operator name — so the reply box +
// resolve dialog pre-fill with whoever is on the desk. Shared across tickets.
const OPERATOR_KEY = "jr_support_operator_name";

const SUBJECT_LABELS: Record<string, string> = {
  DRIVER: "Driver",
  RIDE: "Ride",
  GENERAL: "General"
};

function ticketSource(t: Ticket): "HOSPITAL" | "DRIVER" | "USER" {
  if (t.source === "DRIVER") return "DRIVER";
  if (t.source === "USER") return "USER";
  return "HOSPITAL";
}

function ticketPriority(t: Ticket): Priority {
  const p = (t.priority ?? "NORMAL").toUpperCase();
  return p === "LOW" || p === "HIGH" || p === "URGENT" ? (p as Priority) : "NORMAL";
}

function ticketSeverity(t: Ticket): Severity {
  const s = (t.severity ?? "MEDIUM").toUpperCase();
  return s === "LOW" || s === "HIGH" || s === "CRITICAL" ? (s as Severity) : "MEDIUM";
}

function sourceBadge(t: Ticket): { label: string; bg: string; fg: string } {
  const src = ticketSource(t);
  if (src === "DRIVER") return { label: "Driver", bg: "rgba(59,130,246,0.12)", fg: "#2563EB" };
  if (src === "USER") return { label: "User", bg: "rgba(16,185,129,0.12)", fg: "#059669" };
  return { label: "Hospital", bg: "rgba(139,92,246,0.12)", fg: "#7C3AED" };
}

function categoryBadge(t: Ticket): { label: string; bg: string; fg: string } {
  if (t.category === "FEEDBACK") return { label: "Feedback", bg: "rgba(245,158,11,0.14)", fg: "#B45309" };
  return { label: "Issue", bg: "rgba(99,102,241,0.12)", fg: "#4F46E5" };
}

// Bubble palette keyed by author_role — admin reads as the neutral "us" tone,
// each raiser source carries its list-badge accent so the thread stays
// scannable. Mirrors the source colours used across the support list.
function roleTone(role: string): { name: string; bg: string; border: string; fg: string } {
  switch ((role ?? "").toUpperCase()) {
    case "ADMIN":
      return { name: "JR team", bg: "var(--accent)", border: "var(--accent)", fg: "#fff" };
    case "DRIVER":
      return { name: "Driver", bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.30)", fg: "var(--ink, #0F172A)" };
    case "USER":
      return { name: "User", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.30)", fg: "var(--ink, #0F172A)" };
    case "HOSPITAL":
      return { name: "Hospital", bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.30)", fg: "var(--ink, #0F172A)" };
    default:
      return { name: role || "—", bg: "rgba(148,163,184,0.12)", border: "var(--border, #E2E8F0)", fg: "var(--ink, #0F172A)" };
  }
}

// Who raised it, picked by source (hospital name / driver name+vehicle / user).
function raiserLabel(d: Detail): string {
  const t = d.ticket;
  const src = ticketSource(t);
  if (src === "DRIVER") {
    const name = d.raiser.name ?? t.raiser_driver_name ?? "Driver";
    const veh = d.raiser.detail ?? t.raiser_driver_vehicle;
    return veh ? `${name} · ${veh}` : name;
  }
  if (src === "USER") return d.raiser.name ?? t.raiser_user_name ?? "User";
  return d.raiser.name ?? t.hospital_name ?? "—";
}

// Subject reference — never a raw UUID. Rides show #displayId (or '—').
function subjectRef(t: Ticket): React.ReactNode {
  if (t.subject_type === "DRIVER" && t.driver_id) {
    return (
      <Link href={`/drivers/${t.driver_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
        {t.driver_name ?? "Driver"}
        {t.driver_vehicle ? <span className="muted"> · {t.driver_vehicle}</span> : null}
      </Link>
    );
  }
  if (t.subject_type === "RIDE" && t.booking_id) {
    return (
      <Link href={`/bookings/${t.booking_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
        #{t.booking_display_id ?? "—"}
      </Link>
    );
  }
  return <span className="muted">{SUBJECT_LABELS[t.subject_type] ?? t.subject_type}</span>;
}

/**
 * Admin ticket card — polls /api/v1/admin/tickets/:id every 10s so the thread,
 * triage flags + resolution state stay live without a manual refresh, and the
 * poll is cleared on unmount. Renders the header, priority/severity selectors
 * (PATCH on change), the chat thread as bubbles aligned by author_role (admin
 * right, raiser left), a reply box (POST a message with the remembered operator
 * name), and a gated Resolve dialog (closer's name + "reply before resolving").
 */
export function TicketDetailLive({
  ticketId,
  initialData,
  apiBase
}: {
  ticketId: string;
  initialData: Detail;
  apiBase: string;
}) {
  const [data, setData] = useState<Detail>(initialData);
  const [lastFetch, setLastFetch] = useState<number>(Date.now());
  // Pause the poll's setData while a PATCH/POST round-trip is in flight so an
  // in-flight optimistic edit isn't clobbered by a stale poll response.
  const mutatingRef = useRef(false);

  // Triage flag local state — seeded from the ticket, kept in sync as the poll
  // brings external changes. PATCH fires on change.
  const [priority, setPriorityState] = useState<Priority>(ticketPriority(initialData.ticket));
  const [severity, setSeverityState] = useState<Severity>(ticketSeverity(initialData.ticket));
  const [flagBusy, setFlagBusy] = useState<null | "priority" | "severity">(null);
  const [flagErr, setFlagErr] = useState<string | null>(null);

  // Reply box.
  const [operator, setOperator] = useState<string>("");
  const [reply, setReply] = useState<string>("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyErr, setReplyErr] = useState<string | null>(null);

  // Resolve / reopen.
  const [resolveOpen, setResolveOpen] = useState(false);
  const [closerName, setCloserName] = useState<string>("");
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const [reopenBusy, setReopenBusy] = useState(false);

  // Remembered operator name (localStorage) → pre-fills reply author + closer.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OPERATOR_KEY) ?? "";
      if (saved) setOperator(saved);
    } catch {
      /* localStorage unavailable — operator just types each time */
    }
  }, []);

  const refetch = async () => {
    const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/${ticketId}`);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const next: Detail = await res.json();
    setData(next);
    setLastFetch(Date.now());
    return next;
  };

  // Live poll (10s) — cleared on unmount. Skips applying a stale response while
  // a mutation is mid-flight. Keeps the last good payload on a transient error.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (mutatingRef.current) return;
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/${ticketId}`);
        if (!res.ok) return;
        const next: Detail = await res.json();
        if (!alive || mutatingRef.current) return;
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
  }, [apiBase, ticketId]);

  // Reconcile the triage selects when the poll brings an external flag change
  // (e.g. a teammate retriaged the same ticket). Only while no flag PATCH is in
  // flight so we never fight the operator's own pending change. Only setState
  // when the value actually changed so the 10s poll doesn't churn the selects.
  useEffect(() => {
    if (flagBusy) return;
    const nextPriority = ticketPriority(data.ticket);
    const nextSeverity = ticketSeverity(data.ticket);
    setPriorityState((prev) => (prev === nextPriority ? prev : nextPriority));
    setSeverityState((prev) => (prev === nextSeverity ? prev : nextSeverity));
  }, [data.ticket, flagBusy]);

  // Collapse the two-column ticket grid to a single column under ~900px so the
  // header + chat stack instead of cramping. Tracked here because inline styles
  // can't carry a media query.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const { ticket, messages } = data;
  const isResolved = ticket.status === "RESOLVED";

  const rememberOperator = (name: string) => {
    try {
      if (name.trim()) window.localStorage.setItem(OPERATOR_KEY, name.trim());
    } catch {
      /* best-effort */
    }
  };

  async function patchFlag(field: "priority" | "severity", value: Priority | Severity) {
    // Optimistic select flip; reconcile on the next poll / refetch.
    if (field === "priority") setPriorityState(value as Priority);
    else setSeverityState(value as Severity);
    setFlagBusy(field);
    setFlagErr(null);
    mutatingRef.current = true;
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: value })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Save failed (${res.status})`);
      }
      // PATCH returns { ok: true } — refetch to land the canonical row.
      await refetch();
    } catch (e: any) {
      setFlagErr(e?.message ?? "Could not update");
      // Roll back to whatever the server last gave us.
      setPriorityState(ticketPriority(data.ticket));
      setSeverityState(ticketSeverity(data.ticket));
    } finally {
      mutatingRef.current = false;
      setFlagBusy(null);
    }
  }

  async function sendReply() {
    const body = reply.trim();
    const authorName = operator.trim();
    if (!body) return;
    if (authorName.length < 2) {
      setReplyErr("Enter your name (the operator replying) — at least 2 characters.");
      return;
    }
    setReplyBusy(true);
    setReplyErr(null);
    mutatingRef.current = true;
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, authorName })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error === "invalid_input" ? "Check your name + message." : j.error ?? `Send failed (${res.status})`);
      }
      rememberOperator(authorName);
      setReply("");
      await refetch();
    } catch (e: any) {
      setReplyErr(e?.message ?? "Could not send");
    } finally {
      mutatingRef.current = false;
      setReplyBusy(false);
    }
  }

  function openResolve() {
    // Default the closer to the remembered operator (or whatever's typed).
    setCloserName(operator.trim());
    setResolveErr(null);
    setResolveOpen(true);
  }

  async function confirmResolve() {
    const resolvedBy = closerName.trim();
    if (resolvedBy.length < 2) {
      setResolveErr("Enter the closer's name (at least 2 characters).");
      return;
    }
    setResolveBusy(true);
    setResolveErr(null);
    mutatingRef.current = true;
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "RESOLVED", resolvedBy })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409 || j.error === "reply_required") {
          throw new Error("Add a reply before resolving.");
        }
        if (j.error === "resolver_name_required") {
          throw new Error("Enter the closer's name.");
        }
        throw new Error(j.error ?? `Resolve failed (${res.status})`);
      }
      rememberOperator(resolvedBy);
      setResolveOpen(false);
      await refetch();
    } catch (e: any) {
      setResolveErr(e?.message ?? "Could not resolve");
    } finally {
      mutatingRef.current = false;
      setResolveBusy(false);
    }
  }

  async function reopen() {
    setReopenBusy(true);
    mutatingRef.current = true;
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "OPEN" })
      });
      if (!res.ok) throw new Error("reopen");
      await refetch();
    } catch {
      /* keep last good; the poll will reconcile */
    } finally {
      mutatingRef.current = false;
      setReopenBusy(false);
    }
  }

  // The resolve gate also lives client-side as a hint: a ticket can't be
  // resolved until at least one ADMIN reply exists (the server enforces this
  // with a 409 — we mirror it so the button reads clearly before the click).
  const hasAdminReply = messages.some((m) => (m.author_role ?? "").toUpperCase() === "ADMIN");

  const src = sourceBadge(ticket);
  const cat = categoryBadge(ticket);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={chipStyle(src.bg, src.fg)}>{src.label}</span>
          <span style={chipStyle(cat.bg, cat.fg)}>{cat.label}</span>
          <span
            style={chipStyle(
              isResolved ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              isResolved ? "#16A34A" : "#DC2626"
            )}
          >
            {isResolved ? "Resolved" : "Open"}
          </span>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
          Live · refreshed {formatTimeIST(new Date(lastFetch))}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,2fr)",
          gap: 12
        }}
      >
        {/* Ticket header + triage */}
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Ticket</h3>
          <Field label="Source" value={src.label} />
          <Field label="Raised by" value={raiserLabel(data)} />
          <Field label="Category" value={cat.label} />
          <Field label="Subject" value={subjectRef(ticket)} />
          <Field label="Created" value={formatIST(ticket.created_at)} />
          {isResolved ? (
            <>
              <Field label="Resolved" value={ticket.resolved_at ? formatIST(ticket.resolved_at) : "—"} />
              <Field label="Resolved by" value={ticket.resolved_by ?? "—"} />
            </>
          ) : null}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, marginBottom: 8 }}>
              Triage
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={selectLabel}>
                Priority
                <select
                  value={priority}
                  disabled={flagBusy === "priority"}
                  onChange={(e) => void patchFlag("priority", e.target.value as Priority)}
                  style={selectStyle}
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </label>
              <label style={selectLabel}>
                Severity
                <select
                  value={severity}
                  disabled={flagBusy === "severity"}
                  onChange={(e) => void patchFlag("severity", e.target.value as Severity)}
                  style={selectStyle}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </label>
            </div>
            {flagErr ? <div style={{ color: "var(--danger, #DC2626)", fontSize: 12, marginTop: 6 }}>{flagErr}</div> : null}
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isResolved ? (
              <button
                type="button"
                onClick={() => void reopen()}
                disabled={reopenBusy}
                style={{ ...secondaryBtn, opacity: reopenBusy ? 0.6 : 1, cursor: reopenBusy ? "default" : "pointer" }}
              >
                {reopenBusy ? "Reopening…" : "Reopen ticket"}
              </button>
            ) : (
              <button
                type="button"
                onClick={openResolve}
                disabled={!hasAdminReply}
                style={{ ...primaryBtn, opacity: hasAdminReply ? 1 : 0.5, cursor: hasAdminReply ? "pointer" : "not-allowed" }}
                title={hasAdminReply ? "Resolve this ticket" : "Add a reply before resolving"}
              >
                Resolve…
              </button>
            )}
          </div>
          {!isResolved && !hasAdminReply ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Reply at least once before resolving.
            </div>
          ) : null}
        </div>

        {/* Chat thread — the grid gives this the wide (2fr) track. */}
        <div className="card" style={{ minWidth: 0 }}>
          <h3 style={{ margin: "0 0 12px" }}>Conversation · {messages.length}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 ? (
              <div className="muted">No messages yet.</div>
            ) : (
              messages.map((m) => {
                const role = (m.author_role ?? "").toUpperCase();
                const isAdmin = role === "ADMIN";
                const tone = roleTone(role);
                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: isAdmin ? "flex-end" : "flex-start"
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, padding: "0 4px" }}>
                      <strong style={{ color: "var(--ink, #0F172A)" }}>{m.author_name ?? tone.name}</strong>
                      <span> · {tone.name} · {formatIST(m.created_at)}</span>
                    </div>
                    <div
                      style={{
                        maxWidth: "82%",
                        padding: "8px 12px",
                        borderRadius: 12,
                        background: tone.bg,
                        color: tone.fg,
                        border: `1px solid ${tone.border}`,
                        fontSize: 13,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        borderBottomRightRadius: isAdmin ? 3 : 12,
                        borderBottomLeftRadius: isAdmin ? 12 : 3
                      }}
                    >
                      {m.body}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Reply box */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>
                Replying as
              </span>
              <input
                type="text"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
                onBlur={(e) => rememberOperator(e.target.value)}
                placeholder="Your name"
                style={{ flex: "0 1 200px", padding: "6px 10px", border: "1px solid var(--border, #CBD5E1)", borderRadius: 6, fontSize: 13, fontFamily: "inherit", color: "var(--ink)" }}
              />
            </div>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply to the raiser…"
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid var(--border, #CBD5E1)",
                borderRadius: 8,
                fontSize: 14,
                fontFamily: "inherit",
                color: "var(--ink)",
                boxSizing: "border-box",
                resize: "vertical"
              }}
            />
            {replyErr ? <div style={{ color: "var(--danger, #DC2626)", fontSize: 12, marginTop: 4 }}>{replyErr}</div> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void sendReply()}
                disabled={replyBusy || reply.trim() === ""}
                style={{
                  ...primaryBtn,
                  opacity: replyBusy || reply.trim() === "" ? 0.5 : 1,
                  cursor: replyBusy || reply.trim() === "" ? "default" : "pointer"
                }}
              >
                {replyBusy ? "Sending…" : "Send reply"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resolve dialog — requires the closer's name; surfaces the 409 gate. */}
      {resolveOpen ? (
        <div onClick={() => !resolveBusy && setResolveOpen(false)} style={modalScrim}>
          <div onClick={(e) => e.stopPropagation()} style={modalBox}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>Resolve this ticket?</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 16px", lineHeight: 1.5 }}>
              Marks the ticket resolved and records who closed it. A reply must already be on the thread.
            </p>
            <div style={fieldLabel}>Closed by</div>
            <input
              type="text"
              value={closerName}
              onChange={(e) => setCloserName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void confirmResolve(); }}
              autoFocus
              placeholder="Your name"
              style={modalInput}
            />
            {resolveErr ? <div style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{resolveErr}</div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
              <button onClick={() => { setResolveOpen(false); setResolveErr(null); }} disabled={resolveBusy} style={cancelBtn}>Cancel</button>
              <button
                onClick={() => void confirmResolve()}
                disabled={resolveBusy || closerName.trim().length < 2}
                style={{ ...confirmBtn, opacity: resolveBusy || closerName.trim().length < 2 ? 0.5 : 1, cursor: resolveBusy || closerName.trim().length < 2 ? "not-allowed" : "pointer" }}
              >
                {resolveBusy ? "Resolving…" : "Resolve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", gap: 12 }}>
      <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
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

const selectLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 10,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.4
};

const selectStyle: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--border, #CBD5E1)",
  borderRadius: 6,
  fontSize: 13,
  background: "transparent",
  color: "var(--ink, #0F172A)"
};

const primaryBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--ink, #0F172A)",
  border: "1px solid var(--border, #E2E8F0)",
  padding: "8px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};

const modalScrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000
};

const modalBox: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 24,
  width: 440,
  maxWidth: "92vw",
  boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
  boxSizing: "border-box",
  display: "block"
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 600,
  marginBottom: 6,
  display: "block"
};

const modalInput: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
  color: "#0F172A",
  boxSizing: "border-box"
};

const cancelBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #CBD5E1",
  color: "#0F172A",
  padding: "8px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};

const confirmBtn: React.CSSProperties = {
  background: "#16A34A",
  border: "none",
  color: "#fff",
  padding: "8px 18px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};
