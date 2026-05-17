"use client";

import React, { useState } from "react";

export function LoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error === "invalid_password" ? "Wrong password." : "Login failed. Try again.");
      }
      // Redirect to the dashboard root after a successful login.
      window.location.href = "/";
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
            <small style={styles.brandSub}>OPERATIONS · ADMIN ACCESS</small>
          </div>
        </div>
        <label style={styles.label}>
          Admin password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="Enter ops password"
            style={styles.input}
          />
        </label>
        {err ? <div style={styles.err}>{err}</div> : null}
        <button
          type="submit"
          disabled={busy || password.length < 1}
          style={{ ...styles.btn, opacity: busy || password.length < 1 ? 0.6 : 1 }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div style={styles.hint}>
          This dashboard is for the JR operations team. Unauthorised access is logged and blocked.
        </div>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F7F8FB",
    fontFamily: "-apple-system, system-ui, sans-serif"
  },
  card: {
    width: 360,
    background: "#fff",
    borderRadius: 14,
    padding: 28,
    border: "1px solid #E2E8F0",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
    display: "flex",
    flexDirection: "column",
    gap: 18
  },
  brand: { display: "flex", alignItems: "center", gap: 12, marginBottom: 4 },
  brandMark: {
    width: 44, height: 44, borderRadius: 12, background: "#E5322B",
    color: "#fff", fontWeight: 700, fontSize: 18,
    display: "flex", alignItems: "center", justifyContent: "center"
  },
  brandTitle: { margin: 0, fontSize: 18, color: "#0F172A" },
  brandSub: { color: "#64748B", fontSize: 10, letterSpacing: 0.6 },
  label: { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "#475569", textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    padding: "12px 14px", border: "1px solid #CBD5E1", borderRadius: 8,
    fontSize: 14, color: "#0F172A", outline: "none"
  },
  err: { background: "rgba(220,38,38,0.08)", color: "#DC2626", padding: 10, borderRadius: 8, fontSize: 13 },
  btn: {
    background: "#E5322B", color: "#fff", border: "none",
    padding: "12px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600,
    cursor: "pointer"
  },
  hint: { fontSize: 11, color: "#94A3B8", lineHeight: 1.5 }
};
