"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../lib/adminFetch";

/**
 * Inline-editable single field for user + driver detail pages.
 *
 * Two states:
 *  - Read: shows label + value + small "Edit" link
 *  - Edit: shows input + Save / Cancel
 *
 * On Save: PATCH the parent's admin endpoint with { [fieldKey]: value }
 * and refresh the route so the SSR'd page picks up the new value. Mobile
 * apps re-read these via /me on next refresh — no APK rebuild required
 * for any profile-field change.
 */
export function EditableField({
  label,
  value,
  apiBase,
  patchUrl,
  fieldKey,
  placeholder,
  multiline = false
}: {
  label: string;
  value: string | null | undefined;
  apiBase: string;
  /** e.g. `/api/v1/admin/users/${id}` or `/api/v1/admin/drivers/${id}` */
  patchUrl: string;
  /** Server-side field name in the PATCH body (camelCase). */
  fieldKey: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminFetch(`${apiBase}${patchUrl}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [fieldKey]: draft })
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div style={fieldRow}>
        <span style={labelStyle}>{label}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: value ? "var(--ink)" : "var(--muted)" }}>
            {value ?? "—"}
          </span>
          <button
            onClick={() => { setDraft(value ?? ""); setEditing(true); setErr(null); }}
            style={editLink}
            title={`Edit ${label}`}
          >
            ✎
          </button>
        </span>
      </div>
    );
  }

  const sharedInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid var(--accent, #1E5EFF)",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "inherit",
    color: "var(--ink)",
    outline: "none",
    boxSizing: "border-box"
  };

  return (
    <div style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
        {label}
      </div>
      {multiline ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}
          placeholder={placeholder}
          autoFocus
          rows={3}
          style={{ ...sharedInputStyle, resize: "vertical" }}
        />
      ) : (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          placeholder={placeholder}
          autoFocus
          style={sharedInputStyle}
        />
      )}
      {err ? <div style={{ color: "var(--danger, #DC2626)", fontSize: 12, marginTop: 4 }}>{err}</div> : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
        <button onClick={() => setEditing(false)} style={cancelBtn} disabled={busy}>Cancel</button>
        <button onClick={save} style={saveBtn} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

const fieldRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 0",
  borderBottom: "1px solid var(--border)"
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.4
};

const editLink: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--accent, #1E5EFF)",
  cursor: "pointer",
  fontSize: 14,
  padding: "2px 6px",
  borderRadius: 4,
  opacity: 0.7,
  transition: "opacity 0.15s"
};

const cancelBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--muted)",
  padding: "4px 12px",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer"
};

const saveBtn: React.CSSProperties = {
  background: "var(--ink, #0F172A)",
  border: "none",
  color: "#fff",
  padding: "4px 14px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer"
};
