"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../../lib/adminFetch";

/**
 * Password-gated booking delete. Surfaces a small icon on each
 * bookings row + a labelled button on the detail page. Click → modal
 * asks for the booking-delete password (separate from the dashboard
 * login password — both gates must hold for the destructive call to
 * fire).
 *
 * On success: cascade-deletes booking_events + the bookings row, then
 * refreshes the parent route so analytics + lists re-fetch.
 *
 * The two-password model is deliberate: we never want a stray admin
 * session (e.g. leaked from a closed laptop) to be able to nuke a
 * production ride. The delete password lives only in the operator's
 * head; it never enters localStorage or cookies.
 */
export function DeleteBookingButton({
  bookingId,
  apiBase,
  short = false,
  onDeleted
}: {
  bookingId: string;
  apiBase: string;
  /** Compact icon-only variant for table rows. */
  short?: boolean;
  /** Optional callback after a successful delete (e.g., navigate away). */
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/bookings/${bookingId}/delete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error === "delete_password_required"
            ? "Wrong delete password."
            : data.error === "not_found"
            ? "Booking already deleted."
            : `Delete failed (${res.status})`
        );
      }
      setOpen(false);
      setPassword("");
      onDeleted ? onDeleted() : router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Delete this booking (password required)"
        style={short ? trigShort : trigBig}
      >
        🗑{short ? "" : " Delete booking"}
      </button>

      {open ? (
        <div onClick={() => setOpen(false)} style={modalScrim}>
          <div onClick={(e) => e.stopPropagation()} style={modalBox}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>Delete this booking?</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 16px", lineHeight: 1.5 }}>
              Permanently removes the booking, its event timeline, and adjusts analytics. Cannot be undone.
            </p>
            <div style={fieldLabel}>Booking</div>
            <div className="mono" style={{ fontSize: 13, marginBottom: 16, wordBreak: "break-all", color: "#0F172A", background: "rgba(148,163,184,0.10)", padding: "8px 10px", borderRadius: 6 }}>
              {bookingId}
            </div>
            <div style={fieldLabel}>Delete password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              autoFocus
              placeholder="Out-of-band ops password"
              style={modalInput}
            />
            {err ? <div style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{err}</div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
              <button onClick={() => { setOpen(false); setPassword(""); setErr(null); }} style={cancelBtn}>Cancel</button>
              <button onClick={submit} disabled={busy || !password} style={{ ...confirmBtn, opacity: busy || !password ? 0.5 : 1, cursor: busy || !password ? "not-allowed" : "pointer" }}>
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const trigShort: React.CSSProperties = {
  background: "transparent",
  border: "1px solid transparent",
  color: "var(--muted)",
  fontSize: 14,
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: 6,
  transition: "color 0.15s, background 0.15s, border-color 0.15s"
};

const trigBig: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #DC2626",
  color: "#DC2626",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  padding: "8px 16px",
  borderRadius: 8,
  transition: "background 0.15s, color 0.15s"
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
  // Explicit box-sizing — the global stylesheet sets `* { box-sizing:
  // border-box }` but Next can hydrate before that's applied; pinning
  // it here stops the password input from over-flowing on first paint.
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
  background: "#DC2626",
  border: "none",
  color: "#fff",
  padding: "8px 18px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};
