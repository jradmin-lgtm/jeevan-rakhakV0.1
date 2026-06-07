"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatIST } from "../../../../lib/dates";
import { RaiseTicketForm } from "../../RaiseTicketForm";

/**
 * Hospital portal Feedbacks page (v1.2.2). A "Leave feedback" button opens the
 * shared RaiseTicketForm as GENERAL with category=FEEDBACK (locked); below it,
 * the hospital's own FEEDBACK tickets (GET /hospital/tickets?category=FEEDBACK,
 * scoped server-side to hospital_id=hid) refresh on a 10s poll. The interval is
 * cleared on unmount (timer-leak rule). Feedback isn't an actionable "open"
 * item, so no Open/Resolved chip here — that's Help & Support's concern.
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

export function HospitalFeedbacksLive() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const aliveRef = useRef(true);

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital-proxy/api/v1/hospital/tickets?category=FEEDBACK", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (!aliveRef.current) return;
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
      setLoaded(true);
    } catch {
      /* keep last good */
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
            Leave feedback
          </button>
        ) : null}
      </div>

      {showForm ? (
        <RaiseTicketForm
          subjectType="GENERAL"
          category="FEEDBACK"
          lockCategory
          onDone={(submitted) => {
            setShowForm(false);
            if (submitted) void fetchTickets();
          }}
        />
      ) : null}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Your feedback · {tickets.length}</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
            Live
          </span>
        </div>
        {!loaded ? (
          <div className="muted">Loading feedback…</div>
        ) : tickets.length === 0 ? (
          <div className="muted">No feedback yet. Use “Leave feedback” above to share it with the operations team.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" }}>
                  <th style={{ padding: "8px 8px 8px 0" }}>Subject</th>
                  <th style={{ padding: 8 }}>Message</th>
                  <th style={{ padding: 8 }}>Shared</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                    <td style={{ padding: "10px 8px 10px 0", fontWeight: 500, whiteSpace: "nowrap" }}>{subjectLabel(t)}</td>
                    <td style={{ padding: 10, maxWidth: 420 }}>{t.message}</td>
                    <td style={{ padding: 10, whiteSpace: "nowrap" }} className="muted">{formatIST(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
