"use client";

import React, { useState } from "react";
import { adminFetch } from "../../../../lib/adminFetch";

/**
 * v1.2.0 (CR#3): hospital portal credential management. Lets an admin set the
 * one-login-per-hospital portal username + password and flip the Enable gate.
 *
 * The password is write-only: it is hashed server-side (scrypt) and the hash is
 * NEVER returned to the browser, so this component can show the current username
 * + enabled state but can only SET a new password — it never echoes one back.
 * Save → PUT /api/proxy/api/v1/admin/hospitals/<id>/portal (the proxy attaches
 * the admin key server-side). "Open hospital dashboard" deep-links the operator
 * to the separate hospital login surface in a new tab.
 */
export function HospitalPortalCreds({
  hospitalId,
  apiBase,
  initialUsername,
  initialEnabled
}: {
  hospitalId: string;
  apiBase: string;
  initialUsername?: string | null;
  initialEnabled?: boolean;
}) {
  const [currentUsername, setCurrentUsername] = useState<string | null>(initialUsername ?? null);
  const [username, setUsername] = useState<string>(initialUsername ?? "");
  const [password, setPassword] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(!!initialEnabled);
  // Persisted (server-truth) enabled — drives the deep-link so it only opens
  // when access is ACTUALLY on, not on an unsaved toggle. Updated after a save.
  const [savedEnabled, setSavedEnabled] = useState<boolean>(!!initialEnabled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    try {
      const body: { username?: string; password?: string; enabled: boolean } = { enabled };
      const trimmedUser = username.trim();
      if (trimmedUser && trimmedUser !== (currentUsername ?? "")) body.username = trimmedUser;
      if (password) {
        if (password.length < 8) throw new Error("Password must be at least 8 characters.");
        body.password = password;
      }
      const res = await adminFetch(`${apiBase}/api/v1/admin/hospitals/${hospitalId}/portal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error === "password_too_short"
          ? "Password must be at least 8 characters."
          : data.error === "nothing_to_update"
            ? "Nothing to update."
            : data.error ?? `Save failed (${res.status})`;
        throw new Error(msg);
      }
      // Reflect the new state; never keep the password around.
      if (body.username) setCurrentUsername(body.username);
      setSavedEnabled(enabled); // server now matches the toggle → link reflects truth
      setPassword("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ marginTop: 0 }}>Hospital Portal</h3>
        {/* v1.2.4: gate the deep-link on the PERSISTED enabled state (savedEnabled),
            not the unsaved toggle — so it only opens when access is actually ON on
            the server. When disabled show it greyed + non-clickable with a hint, so
            the access state is obvious at a glance. */}
        {savedEnabled ? (
          <a
            href="/hospital-login"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600, padding: "6px 12px", border: "1px solid var(--accent, #1E5EFF)", borderRadius: 6, textDecoration: "none" }}
          >
            Open hospital dashboard ↗
          </a>
        ) : (
          <span
            title="Enable portal access to open"
            aria-disabled="true"
            style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, cursor: "not-allowed", opacity: 0.6 }}
          >
            Open hospital dashboard ↗
          </span>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        One login per hospital. The portal shows this hospital&apos;s live incoming rides and patient records.
        Set a username + password and enable access; share the credentials with the hospital out-of-band.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Portal username {currentUsername ? <span style={{ textTransform: "none", letterSpacing: 0 }}>(current: {currentUsername})</span> : null}
          </span>
          <input
            type="text"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. srms-portal"
            style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "var(--ink)" }}
          />
        </label>

        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {currentUsername ? "Reset password" : "Set password"}
          </span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep the current password"
            style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 14, fontFamily: "inherit", color: "var(--ink)" }}
          />
          <span className="muted" style={{ fontSize: 11 }}>Min 8 characters. The password is never shown back once set.</span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Portal access enabled</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: enabled ? "#DCFCE7" : "#FEE2E2", color: enabled ? "#166534" : "#B91C1C" }}>
            {enabled ? "ENABLED" : "DISABLED"}
          </span>
        </label>

        {err ? <div style={{ color: "var(--danger, #DC2626)", fontSize: 12 }}>{err}</div> : null}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: saved ? "var(--success, #10B981)" : "var(--muted)" }}>
            {saved ? "✓ Saved" : currentUsername ? "Credentials configured" : "No credentials set yet"}
          </span>
          <button
            onClick={save}
            disabled={busy}
            style={{
              fontSize: 13,
              fontWeight: 600,
              padding: "6px 14px",
              border: "none",
              borderRadius: 6,
              background: "var(--accent)",
              color: "#fff",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1
            }}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
