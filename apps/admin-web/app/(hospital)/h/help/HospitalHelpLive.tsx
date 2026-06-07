"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatIST } from "../../../../lib/dates";
import { RaiseTicketForm } from "../../RaiseTicketForm";
import { TicketThread } from "../../TicketThread";

/**
 * Hospital portal Help & Support page (v1.2.2; was Support in v1.2.1, CR#3). A
 * "Raise an issue" button opens the shared RaiseTicketForm as GENERAL with
 * category=ISSUE (locked); below it, the hospital's own ISSUE tickets (GET
 * /hospital/tickets?category=ISSUE, scoped server-side to hospital_id=hid) show
 * with their Open/Resolved status and refresh on a 10s poll. The interval is
 * cleared on unmount (timer-leak rule). Soft feedback lives on the Feedbacks tab.
 */

type Ticket = {
  id: string;
  subject_type: "DRIVER" | "RIDE" | "GENERAL";
  category: "FEEDBACK" | "ISSUE";
  message: string;
  status: "OPEN" | "RESOLVED";
  created_at: string;
  resolved_at?: string | null;
  driver_id?: string | null;
  booking_id?: string | null;
  driver_name?: string | null;
  ambulance_number?: string | null;
  booking_display_id?: string | null;
};

const POLL_MS = 10000;

const STATUS_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  OPEN: { label: "Open", bg: "rgba(245,158,11,0.14)", fg: "#92400E" },
  RESOLVED: { label: "Resolved", bg: "rgba(16,185,129,0.12)", fg: "#065F46" }
};

function subjectLabel(t: Ticket): string {
  if (t.subject_type === "DRIVER") {
    const who = t.driver_name ?? "Driver";
    return t.ambulance_number ? `Driver · ${who} (${t.ambulance_number})` : `Driver · ${who}`;
  }
  if (t.subject_type === "RIDE") {
    return `Ride · #${t.booking_display_id ?? "—"}`;
  }
  return "General";
}

export function HospitalHelpLive() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital-proxy/api/v1/hospital/tickets?category=ISSUE", { cache: "no-store" });
      if (!aliveRef.current) return;
      if (!res.ok) {
        // Handled failure: leave the page interactive (loaded) and surface a
        // retrying notice instead of an eternal "Loading…". The 10s poll retries.
        setLoadError(true);
        setLoaded(true);
        return;
      }
      const json = await res.json();
      if (!aliveRef.current) return;
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
      setLoadError(false);
      setLoaded(true);
    } catch {
      // Keep last good tickets, but mark loaded + the error so we never hang on
      // "Loading…" and the poll keeps retrying.
      if (!aliveRef.current) return;
      setLoadError(true);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void fetchTickets();
    const id = setInterval(fetchTickets, POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, [fetchTickets]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {!showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            Raise an issue
          </button>
        ) : null}
      </div>

      {showForm ? (
        <RaiseTicketForm
          subjectType="GENERAL"
          category="ISSUE"
          lockCategory
          onDone={(submitted) => {
            setShowForm(false);
            if (submitted) void fetchTickets();
          }}
        />
      ) : null}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Your issues · {tickets.length}</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
            Live
          </span>
        </div>
        {!loaded ? (
          <div className="muted">Loading issues…</div>
        ) : loadError && tickets.length === 0 ? (
          <div style={{ color: "var(--danger)" }}>Couldn’t load your issues — retrying…</div>
        ) : tickets.length === 0 ? (
          <div className="muted">No issues raised yet. Use “Raise an issue” above to send one to the operations team.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" }}>
                  <th style={{ padding: "8px 8px 8px 0" }}>Subject</th>
                  <th style={{ padding: 8 }}>Message</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>Raised</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const chip = STATUS_CHIP[t.status] ?? { label: t.status, bg: "rgba(148,163,184,0.18)", fg: "#475569" };
                  const open = openId === t.id;
                  return (
                    <React.Fragment key={t.id}>
                      <tr
                        onClick={() => setOpenId(open ? null : t.id)}
                        style={{ borderTop: "1px solid var(--border)", verticalAlign: "top", cursor: "pointer", background: open ? "rgba(148,163,184,0.06)" : undefined }}
                      >
                        <td style={{ padding: "10px 8px 10px 0", fontWeight: 500, whiteSpace: "nowrap" }}>
                          <span style={{ color: "var(--muted)", marginRight: 6, display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▸</span>
                          {subjectLabel(t)}
                        </td>
                        <td style={{ padding: 10, maxWidth: 420, overflowWrap: "anywhere", wordBreak: "break-word" }}>{t.message}</td>
                        <td style={{ padding: 10 }}>
                          <span style={{ background: chip.bg, color: chip.fg, fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 999 }}>{chip.label}</span>
                        </td>
                        <td style={{ padding: 10, whiteSpace: "nowrap" }} className="muted">{formatIST(t.created_at)}</td>
                      </tr>
                      {open ? (
                        <tr style={{ background: "rgba(148,163,184,0.06)" }}>
                          <td colSpan={4} style={{ padding: "0 10px 14px 10px" }}>
                            <TicketThread ticketId={t.id} showStatus />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
