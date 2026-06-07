"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatIST } from "../../lib/dates";

/**
 * Shared hospital-portal ticket thread (v1.2.4). Used inline by the Help &
 * Support and Feedbacks lists: when a ticket row is opened it expands into this
 * to-and-fro chat thread.
 *
 * Fetches GET /api/hospital-proxy/api/v1/hospital/tickets/:id (hospital JWT only,
 * never the admin key), RBAC-scoped server-side to this hospital (cross-hospital
 * / app-raised tickets 404, never leaking another raiser's thread). Polls every
 * 10s and clears the interval on unmount (timer-leak rule). The hospital posts a
 * reply via POST /hospital/tickets/:id/messages — the server stamps author_role
 * HOSPITAL + author_name from the hospital row, so the body carries no identity.
 *
 * Bubbles align by author_role: HOSPITAL (this portal) right, everyone else
 * (ADMIN ops, or a DRIVER/USER on a shared ride thread) left. For ISSUE tickets
 * the resolved status + resolved-by (the ops operator who closed it) shows once
 * closed; FEEDBACK tickets aren't actionable so `showStatus` is left off there.
 */

type ThreadMessage = {
  id: string;
  ticket_id: string;
  author_role: "ADMIN" | "HOSPITAL" | "DRIVER" | "USER";
  author_name: string | null;
  body: string;
  created_at: string;
};

type ThreadTicket = {
  id: string;
  subject_type: "DRIVER" | "RIDE" | "GENERAL";
  category: "FEEDBACK" | "ISSUE";
  message: string;
  status: "OPEN" | "RESOLVED";
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

const POLL_MS = 10000;

const ROLE_LABEL: Record<ThreadMessage["author_role"], string> = {
  ADMIN: "Operations team",
  HOSPITAL: "You",
  DRIVER: "Driver",
  USER: "Caller"
};

export function TicketThread({ ticketId, showStatus = false }: { ticketId: string; showStatus?: boolean }) {
  const [ticket, setTicket] = useState<ThreadTicket | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/hospital-proxy/api/v1/hospital/tickets/${ticketId}`, { cache: "no-store" });
      if (res.status === 404) {
        if (aliveRef.current) setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const json = await res.json();
      if (!aliveRef.current) return;
      setTicket(json.ticket ?? null);
      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setLoaded(true);
    } catch {
      /* keep last good */
    }
  }, [ticketId]);

  useEffect(() => {
    aliveRef.current = true;
    void fetchThread();
    const id = setInterval(fetchThread, POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, [fetchThread]);

  const send = async () => {
    const body = reply.trim();
    setError(null);
    if (body.length < 2) {
      setError("Please write at least 2 characters.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/hospital-proxy/api/v1/hospital/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body })
      });
      if (!res.ok) {
        setError("Could not send your reply. Please try again.");
        return;
      }
      setReply("");
      void fetchThread();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSending(false);
    }
  };

  if (notFound) {
    return (
      <div className="muted" style={{ padding: "12px 0", fontSize: 13 }}>
        This ticket is no longer available.
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="muted" style={{ padding: "12px 0", fontSize: 13 }}>
        Loading conversation…
      </div>
    );
  }

  const resolved = ticket?.status === "RESOLVED";

  return (
    <div style={{ display: "grid", gap: 12, padding: "4px 0" }}>
      {showStatus && resolved ? (
        <div
          style={{
            background: "rgba(16,185,129,0.10)",
            color: "#065F46",
            fontSize: 12,
            fontWeight: 600,
            padding: "8px 12px",
            borderRadius: 8
          }}
        >
          Resolved{ticket?.resolved_at ? ` · ${formatIST(ticket.resolved_at)}` : ""}
          {ticket?.resolved_by ? ` · by ${ticket.resolved_by}` : ""}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10 }}>
        {messages.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>No messages yet.</div>
        ) : (
          messages.map((m) => {
            const mine = m.author_role === "HOSPITAL";
            return (
              <div
                key={m.id}
                style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}
              >
                <div style={{ maxWidth: "80%" }}>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--muted)",
                      marginBottom: 3,
                      textAlign: mine ? "right" : "left"
                    }}
                  >
                    {m.author_name ?? ROLE_LABEL[m.author_role] ?? m.author_role} · {formatIST(m.created_at)}
                  </div>
                  <div
                    style={{
                      background: mine ? "var(--accent)" : "var(--card-alt, rgba(148,163,184,0.14))",
                      color: mine ? "#fff" : "var(--text, inherit)",
                      padding: "8px 12px",
                      borderRadius: 12,
                      borderTopRightRadius: mine ? 2 : 12,
                      borderTopLeftRadius: mine ? 12 : 2,
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word"
                    }}
                  >
                    {m.body}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {resolved ? (
        <div className="muted" style={{ fontSize: 12 }}>
          This ticket is resolved. Raise a new one if you need further help.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Write a reply…"
            style={{
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 13,
              width: "100%",
              resize: "vertical",
              fontFamily: "inherit"
            }}
          />
          {error ? <div style={{ color: "var(--danger)", fontSize: 12 }}>{error}</div> : null}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={send}
              disabled={sending || reply.trim().length < 2}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13,
                cursor: sending || reply.trim().length < 2 ? "default" : "pointer",
                opacity: sending || reply.trim().length < 2 ? 0.6 : 1
              }}
            >
              {sending ? "Sending…" : "Reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
