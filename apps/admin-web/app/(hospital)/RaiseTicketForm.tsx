"use client";

import React, { useState } from "react";

/**
 * Shared "Raise a ticket" form (v1.2.1, CR#3 · category v1.2.2). Used by:
 *  - the Help & Support page (opened as GENERAL, category ISSUE),
 *  - the Feedbacks page (opened as GENERAL, category FEEDBACK),
 *  - the driver card "Raise concern" (pre-filled DRIVER + driverId, subject locked),
 *  - the ride card "Raise concern" (pre-filled RIDE + bookingId, subject locked).
 *
 * Submits to POST /api/hospital-proxy/api/v1/hospital/tickets (hospital JWT only,
 * never the admin key). The server re-validates that the driverId/bookingId
 * belongs to THIS hospital, so a locked context here is defence-in-depth, not the
 * trust boundary. `onDone` lets the host refetch its ticket list / close a modal.
 *
 * v1.2.2 `category` (FEEDBACK | ISSUE) splits the one ticket entity into the two
 * hospital-portal sections: FEEDBACK → the Feedbacks tab (soft feedback), ISSUE →
 * Help & Support (something ops should resolve). Contextual "Raise concern" cards
 * default to ISSUE (a concern) but expose a toggle to flip it to feedback. When
 * `lockCategory` is set the toggle is hidden (the section forces its category).
 */

export type TicketSubject = "DRIVER" | "RIDE" | "GENERAL";
export type TicketCategory = "FEEDBACK" | "ISSUE";

const SUBJECT_LABEL: Record<TicketSubject, string> = {
  DRIVER: "A driver",
  RIDE: "A ride",
  GENERAL: "General feedback"
};

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  ISSUE: "An issue (ops should resolve)",
  FEEDBACK: "Feedback (just sharing)"
};

// Mirror the `inp` style object used by the admin HospitalsManager so the
// portal forms read consistently with the ops dashboard (globals.css has no
// `.inp` class — it's a local CSSProperties convention).
const inp: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 13
};

export function RaiseTicketForm({
  subjectType: initialSubject = "GENERAL",
  category: initialCategory = "ISSUE",
  lockCategory = false,
  driverId,
  bookingId,
  contextLabel,
  lockSubject = false,
  onDone
}: {
  subjectType?: TicketSubject;
  /** FEEDBACK (soft) vs ISSUE (ops resolves). Default ISSUE — see file header. */
  category?: TicketCategory;
  /** When the host section forces a category (Feedbacks / Help & Support) hide the toggle. */
  lockCategory?: boolean;
  driverId?: string;
  bookingId?: string;
  /** Human label for the locked context, e.g. "Driver: Ramesh" or "Ride #A1B2". */
  contextLabel?: string;
  /** When opened contextually (driver/ride card) the subject is fixed. */
  lockSubject?: boolean;
  /** Called after a successful submit (and on Cancel) so the host can refetch/close. */
  onDone?: (submitted: boolean) => void;
}) {
  const [subject, setSubject] = useState<TicketSubject>(initialSubject);
  const [category, setCategory] = useState<TicketCategory>(initialCategory);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFeedback = category === "FEEDBACK";

  const trimmed = message.trim();
  const tooShort = trimmed.length < 5;

  const submit = async () => {
    setError(null);
    if (tooShort) {
      setError(`Please describe the ${isFeedback ? "feedback" : "issue"} in at least 5 characters.`);
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { subjectType: subject, category, message: trimmed };
      // Only attach context when relevant — a GENERAL ticket carries neither.
      if (subject === "DRIVER" && driverId) body.driverId = driverId;
      if (subject === "RIDE" && bookingId) body.bookingId = bookingId;
      const res = await fetch("/api/hospital-proxy/api/v1/hospital/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        setError("Could not raise the ticket. Please try again.");
        return;
      }
      setMessage("");
      onDone?.(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ display: "grid", gap: 12, borderLeft: "4px solid var(--accent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{isFeedback ? "Leave feedback" : "Raise an issue"}</h3>
        {contextLabel ? (
          <span className="muted" style={{ fontSize: 12 }}>{contextLabel}</span>
        ) : null}
      </div>

      {!lockCategory ? (
        <div>
          <label className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>
            Type
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(["ISSUE", "FEEDBACK"] as TicketCategory[]).map((c) => {
              const selected = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    background: selected ? "var(--accent)" : "transparent",
                    color: selected ? "#fff" : "var(--muted)",
                    border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
                    padding: "6px 12px",
                    borderRadius: 999,
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer"
                  }}
                >
                  {CATEGORY_LABEL[c]}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <label className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>
          About
        </label>
        {lockSubject ? (
          <div style={{ fontWeight: 600, fontSize: 14 }}>{SUBJECT_LABEL[subject]}</div>
        ) : (
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value as TicketSubject)}
            style={{ ...inp, maxWidth: 280 }}
          >
            <option value="GENERAL">{SUBJECT_LABEL.GENERAL}</option>
            <option value="DRIVER" disabled={!driverId}>{SUBJECT_LABEL.DRIVER}</option>
            <option value="RIDE" disabled={!bookingId}>{SUBJECT_LABEL.RIDE}</option>
          </select>
        )}
      </div>

      <div>
        <label className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 4 }}>
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder={isFeedback ? "Share your feedback (min 5 characters)…" : "Describe the issue (min 5 characters)…"}
          style={{ ...inp, width: "100%", resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      {error ? <div style={{ color: "var(--danger)", fontSize: 13 }}>{error}</div> : null}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {onDone ? (
          <button
            type="button"
            onClick={() => onDone(false)}
            disabled={submitting}
            style={{ background: "transparent", color: "var(--muted)", border: "1px solid var(--border)", padding: "9px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: submitting ? "default" : "pointer" }}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || tooShort}
          style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: submitting || tooShort ? "default" : "pointer", opacity: submitting || tooShort ? 0.6 : 1 }}
        >
          {submitting ? "Sending…" : isFeedback ? "Send feedback" : "Submit issue"}
        </button>
      </div>
    </div>
  );
}
