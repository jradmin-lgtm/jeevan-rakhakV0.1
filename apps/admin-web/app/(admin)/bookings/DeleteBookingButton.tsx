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
            <div style={{ fontWeight: 700, fontSize: 15, color: "#0F172A" }}>Delete this booking?</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
              Permanently removes the booking, its event timeline, and adjusts analytics. Cannot be undone.
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 14, textTransform: "uppercase", letterSpacing: 0.4 }}>Booking</div>
            <div className="mono" style={{ fontSize: 13, marginBottom: 14, wordBreak: "break-all" }}>{bookingId}</div>
            <label style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>Delete password</label>
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
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => { setOpen(false); setPassword(""); setErr(null); }} style={cancelBtn}>Cancel</button>
              <button onClick={submit} disabled={busy || !password} style={{ ...confirmBtn, opacity: busy || !password ? 0.5 : 1 }}>
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
  padding: 22,
  width: 380,
  maxWidth: "92vw",
  boxShadow: "0 20px 60px rgba(0,0,0,0.30)"
};

const modalInput: React.CSSProperties = {
  marginTop: 6,
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit"
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
