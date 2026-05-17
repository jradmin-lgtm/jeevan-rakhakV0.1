"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";

/**
 * Verify / revoke KYC on a driver. Verified drivers can accept ride requests
 * (server-side gate on POST /bookings/:id/accept also checks this flag).
 * Revoking is reversible — flip back to verified whenever ready.
 */
export function KycVerifyToggle({
  driverId,
  initialVerified,
  apiBase
}: {
  driverId: string;
  initialVerified: boolean;
  apiBase: string;
}) {
  const router = useRouter();
  const [verified, setVerified] = useState(initialVerified);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async () => {
    const next = !verified;
    if (!next && !confirm("Revoke this driver's KYC? They will stop receiving ride requests.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/drivers/${driverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycVerified: next })
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      setVerified(next);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        onClick={toggle}
        disabled={busy}
        style={{
          background: verified ? "transparent" : "var(--success)",
          color: verified ? "var(--danger, #DC2626)" : "#fff",
          border: verified ? "1.5px solid var(--danger, #DC2626)" : "none",
          padding: "10px 18px",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: busy ? "wait" : "pointer",
          opacity: busy ? 0.7 : 1
        }}
      >
        {busy ? "Saving…" : verified ? "Revoke verification" : "✓ Verify KYC"}
      </button>
      {err ? <span style={{ color: "var(--danger, #DC2626)", fontSize: 12 }}>{err}</span> : null}
    </div>
  );
}
