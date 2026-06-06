"use client";

import React, { useState } from "react";

/**
 * Hospital portal logout (CR#3, v1.2.0). DELETEs /api/hospital-login to clear
 * the HTTP-only `jr-hospital-session` cookie, then returns to /hospital-login.
 */
export function HospitalLogoutButton() {
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/hospital-login", { method: "DELETE" });
    } catch {
      // best-effort; clear locally regardless
    } finally {
      window.location.href = "/hospital-login";
    }
  };

  return (
    <button type="button" onClick={logout} disabled={busy} style={styles.btn}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "9px 12px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%"
  }
};
