"use client";

import React, { useState } from "react";
import { adminFetch } from "../../../../lib/adminFetch";

type Hospital = { id: string; name: string; city?: string | null; active?: boolean };
type Assigned = { id: string; name: string; isPrimary: boolean };

/**
 * v1.1.2 — driver↔hospital assignment editor. Multi-select (assign to several
 * hospitals), pick one primary (mirrored to the app + dispatch), reassign by
 * toggling. Saves the full set via PUT /admin/drivers/:id/hospitals.
 */
export function DriverHospitals({
  driverId,
  apiBase,
  all,
  assigned
}: {
  driverId: string;
  apiBase: string;
  all: Hospital[];
  assigned: Assigned[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(assigned.map((a) => a.id)));
  const [primary, setPrimary] = useState<string | null>(assigned.find((a) => a.isPrimary)?.id ?? assigned[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSaved(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (primary === id) setPrimary([...next][0] ?? null);
      } else {
        next.add(id);
        if (!primary) setPrimary(id);
      }
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const hospitalIds = [...selected];
      const res = await adminFetch(`${apiBase}/api/v1/admin/drivers/${driverId}/hospitals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospitalIds, primaryHospitalId: primary })
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "save_failed");
      setSaved(true);
    } catch (e: any) {
      setErr(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ margin: "0 0 6px" }}>Hospitals</h3>
      <p className="muted" style={{ fontSize: 11, margin: "0 0 10px" }}>
        Assign this driver to one or more hospitals. The <strong>primary</strong> is shown in the driver's app and used for dispatch. Changes sync to the app on next refresh.
      </p>
      <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto" }}>
        {all.length === 0 ? <span className="muted">No hospitals onboarded yet.</span> : null}
        {all.map((h) => {
          const isSel = selected.has(h.id);
          return (
            <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", background: isSel ? "#F0FDF4" : "#fff" }}>
              <input type="checkbox" checked={isSel} onChange={() => toggle(h.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}{h.active === false ? <span className="muted" style={{ fontWeight: 400 }}> (inactive)</span> : null}</div>
                {h.city ? <div className="muted" style={{ fontSize: 11 }}>{h.city}</div> : null}
              </div>
              {isSel ? (
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: primary === h.id ? "var(--accent)" : "var(--muted)" }}>
                  <input type="radio" name="primary" checked={primary === h.id} onChange={() => { setPrimary(h.id); setSaved(false); }} />
                  primary
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
      {err ? <div style={{ color: "#B91C1C", fontSize: 12, marginTop: 8 }}>{err}</div> : null}
      <button onClick={save} disabled={busy} style={{ marginTop: 12, fontWeight: 600, padding: "8px 16px", border: "none", borderRadius: 6, background: saved ? "var(--success, #16A34A)" : "var(--accent)", color: "#fff", cursor: "pointer" }}>
        {busy ? "Saving…" : saved ? "✓ Saved" : "Save hospitals"}
      </button>
    </div>
  );
}
