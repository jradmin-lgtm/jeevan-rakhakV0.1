"use client";

import React, { useEffect, useState } from "react";

// v1.2.4: shown both when login is rejected with 403 portal_disabled AND when a
// live session is revoked mid-use and bounced here with ?disabled=1.
const PORTAL_DISABLED_MSG =
  "This hospital portal is currently disabled. Please contact the JR team to enable access.";

/**
 * Hospital portal login (CR#3, v1.2.0).
 *
 * Mirrors app/admin-login/LoginForm.tsx in structure, but collects a
 * username + password (a real per-hospital credential, not the single ops
 * password) and POSTs to /api/hospital-login. On success the server sets the
 * HTTP-only `jr-hospital-session` cookie (the hospital JWT) and we route to
 * the hospital dashboard at /h. Branded teal so it reads as a distinct portal
 * from the red ops dashboard.
 */
export function HospitalLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // v1.2.4: a non-error notice (the portal-disabled message shown after a
  // mid-use revocation redirect, separate from a failed login attempt).
  const [notice, setNotice] = useState<string | null>(null);

  // v1.2.4: when requireHospital revokes a live session (403 portal_disabled),
  // the (hospital) guard lands the user here with ?disabled=1 — surface the
  // same disabled notice on mount. Read from window.location to avoid a
  // Suspense boundary for useSearchParams.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("disabled") === "1") setNotice(PORTAL_DISABLED_MSG);
    } catch {
      /* no-op */
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      const res = await fetch("/api/hospital-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data?.error;
        throw new Error(
          code === "missing_credentials"
            ? "Enter both username and password."
            : code === "portal_disabled"
              ? PORTAL_DISABLED_MSG
              : code === "invalid_login"
                ? "Invalid username or password."
                : "Login failed. Try again."
        );
      }
      // Redirect to the hospital dashboard after a successful login.
      window.location.href = "/h";
    } catch (e: any) {
      setErr(e?.message ?? "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit} style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>JR</div>
          <div>
            <h2 style={styles.brandTitle}>Jeevan Rakshak</h2>
            <small style={styles.brandSub}>HOSPITAL PORTAL · PARTNER ACCESS</small>
          </div>
        </div>
        <label style={styles.label}>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            placeholder="Hospital portal username"
            style={styles.input}
          />
        </label>
        <label style={styles.label}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter password"
            style={styles.input}
          />
        </label>
        {notice ? <div style={styles.notice}>{notice}</div> : null}
        {err ? <div style={styles.err}>{err}</div> : null}
        <button
          type="submit"
          disabled={busy || username.length < 1 || password.length < 1}
          style={{
            ...styles.btn,
            opacity: busy || username.length < 1 || password.length < 1 ? 0.6 : 1
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div style={styles.hint}>
          This portal is for partner hospital staff. You can only see ambulances and patients
          assigned to your hospital. Unauthorised access is logged and blocked.
        </div>
      </form>
    </div>
  );
}

const TEAL = "#0F766E";

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F0FAF9",
    fontFamily: "-apple-system, system-ui, sans-serif"
  },
  card: {
    width: 360,
    background: "#fff",
    borderRadius: 14,
    padding: 28,
    border: "1px solid #CCE9E6",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 18
  },
  brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: TEAL,
    color: "#fff",
    fontWeight: 700,
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  brandTitle: { margin: 0, fontSize: 18, color: "#0F172A" },
  brandSub: { color: "#0F766E", fontSize: 10, letterSpacing: 0.6 },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontSize: 12,
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  input: {
    padding: "12px 14px",
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    fontSize: 14,
    color: "#0F172A",
    outline: "none"
  },
  err: { background: "rgba(220,38,38,0.08)", color: "#DC2626", padding: 10, borderRadius: 8, fontSize: 13 },
  notice: { background: "rgba(217,119,6,0.10)", color: "#B45309", padding: 10, borderRadius: 8, fontSize: 13, lineHeight: 1.5 },
  btn: {
    background: TEAL,
    color: "#fff",
    border: "none",
    padding: "12px 16px",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer"
  },
  hint: { fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }
};
