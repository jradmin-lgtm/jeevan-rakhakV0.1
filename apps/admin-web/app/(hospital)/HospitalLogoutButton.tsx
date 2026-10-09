"use client";

import React, { useState } from "react";

/**
 * Hospital portal logout (CR#3, v1.2.0). DELETEs /api/hospital-login to clear
 * the HTTP-only `jr-hospital-session` cookie, then returns to /hospital-login.
 */
export function HospitalLogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const logout = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/hospital-login", { method: "DELETE" });
      if (!res.ok) throw new Error("Sign-out failed. Please retry.");
      window.location.href = "/hospital-login";
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-out failed. Please retry.");
      setBusy(false);
    }
  };

  return (
    <div>{error ? <p role="alert" style={{ color: "#FECACA" }}>{error}</p> : null}<button type="button" onClick={logout} disabled={busy} style={styles.btn}>
      {busy ? "Signing out…" : "Sign out"}
    </button></div>
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
