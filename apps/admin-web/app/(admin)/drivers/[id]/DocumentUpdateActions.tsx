"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../../../lib/adminFetch";

// Same key TicketDetailLive.tsx uses for "who resolved this" — one
// remembered admin name across the portal instead of per-component.
const OPERATOR_KEY = "jr_support_operator_name";

const DOC_LABEL: Record<string, string> = {
  licence: "Driving licence",
  aadhar: "Aadhar card",
  pan: "PAN card"
};

type PendingUpdate = { id: string; docType: string; createdAt: string };

/**
 * 2026-08 — reissue-request review. licence/aadhar/pan can't be freely
 * self-replaced by the driver (see REISSUE_ELIGIBLE_DOC_TYPES in drivers.ts),
 * so a driver-raised request sits here (and as a linked support ticket) until
 * an admin approves (swaps it into driver_documents) or rejects it.
 */
export function DocumentUpdateActions({ driverId, apiBase, pending }: { driverId: string; apiBase: string; pending: PendingUpdate[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [operator, setOperator] = useState(() => {
    try {
      return window.localStorage.getItem(OPERATOR_KEY) ?? "";
    } catch {
      return "";
    }
  });

  const rememberOperator = (name: string) => {
    try {
      if (name.trim()) window.localStorage.setItem(OPERATOR_KEY, name.trim());
    } catch {
      /* best-effort */
    }
  };

  const resolve = async (id: string, action: "approve" | "reject") => {
    const resolvedBy = operator.trim();
    if (resolvedBy.length < 2) {
      setErr("Enter your name first (at least 2 characters) so the ticket reply is attributed.");
      return;
    }
    if (action === "reject" && !confirm("Reject this document update? The driver's existing document stays as-is.")) return;
    setBusyId(id);
    setErr(null);
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/document-updates/${id}/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolvedBy })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed (${res.status})`);
      }
      rememberOperator(resolvedBy);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed");
    } finally {
      setBusyId(null);
    }
  };

  if (pending.length === 0) return null;

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--warning, #B45309)", marginBottom: 8 }}>
        Pending document updates
      </div>
      <input
        value={operator}
        onChange={(e) => setOperator(e.target.value)}
        placeholder="Your name (for the ticket reply)"
        style={{ width: "100%", padding: "6px 8px", fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", marginBottom: 10 }}
      />
      {pending.map((p) => (
        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{DOC_LABEL[p.docType] ?? p.docType}</span>
            <a
              href={`/api/proxy/api/v1/admin/document-updates/${p.id}/raw`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: "var(--accent)" }}
            >
              View new photo
            </a>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => resolve(p.id, "approve")}
              disabled={busyId === p.id}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: "none", background: "var(--success)", color: "#fff", cursor: busyId === p.id ? "wait" : "pointer" }}
            >
              Approve
            </button>
            <button
              onClick={() => resolve(p.id, "reject")}
              disabled={busyId === p.id}
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 6, border: "1.5px solid var(--danger, #DC2626)", background: "transparent", color: "var(--danger, #DC2626)", cursor: busyId === p.id ? "wait" : "pointer" }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
      {err ? <div style={{ color: "var(--danger, #DC2626)", fontSize: 12, marginTop: 6 }}>{err}</div> : null}
    </div>
  );
}
