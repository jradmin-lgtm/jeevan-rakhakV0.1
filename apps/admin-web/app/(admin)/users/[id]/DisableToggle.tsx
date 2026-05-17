"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";

/**
 * Disable/enable toggle shared between user + driver detail pages. Posts the
 * desired state to the admin PATCH endpoint, then refreshes the RSC so the
 * status pill + lifetime panel re-render with the new flag.
 */
export function DisableToggle({
  kind,
  id,
  initialDisabled,
  apiBase
}: {
  kind: "user" | "driver";
  id: string;
  initialDisabled: boolean;
  apiBase: string;
}) {
  const router = useRouter();
  const [disabled, setDisabled] = useState(initialDisabled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    const next = !disabled;
    const verb = next ? "Disable" : "Re-enable";
    // Confirm before disabling — re-enabling is reversible, disabling shuts
    // them out so make the click intentional.
    if (next && !confirm(`${verb} this ${kind}? They will be blocked from signing in.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const path = kind === "user" ? "users" : "drivers";
      const res = await adminFetch(`${apiBase}/api/v1/admin/${path}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: next })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      setDisabled(next);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button
        onClick={toggle}
        disabled={busy}
        style={{
          background: disabled ? "var(--success)" : "var(--danger, #DC2626)",
          color: "#fff",
          border: "none",
          padding: "8px 16px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1
        }}
      >
        {busy ? "Saving…" : disabled ? `Re-enable ${kind}` : `Disable ${kind}`}
      </button>
      {err ? <span style={{ color: "var(--danger, #DC2626)", fontSize: 12 }}>{err}</span> : null}
    </div>
  );
}
