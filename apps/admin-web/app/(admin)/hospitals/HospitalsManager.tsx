"use client";

import React, { useState } from "react";
import { adminFetch } from "../../../lib/adminFetch";

type Hospital = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  active: boolean;
  isDefault: boolean;
};

const blank = { name: "", lat: "", lng: "", address: "", city: "", phone: "", isDefault: false };

/**
 * v1.1.0 (CR#3/#6) — list/add/edit destination hospitals. Setting one default
 * clears the others server-side. Editing the default's lat/lng is how ops
 * corrects the seeded (approximate) SRMS pin.
 */
export function HospitalsManager({ initial, apiBase }: { initial: Hospital[]; apiBase: string }) {
  const [rows, setRows] = useState<Hospital[]>(initial);
  const [form, setForm] = useState<typeof blank>(blank);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    const res = await adminFetch(`${apiBase}/api/v1/admin/hospitals`);
    if (res.ok) setRows((await res.json()).hospitals ?? []);
  };

  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/hospitals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "update_failed");
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const lat = Number(form.lat);
      const lng = Number(form.lng);
      if (!form.name.trim() || Number.isNaN(lat) || Number.isNaN(lng)) {
        throw new Error("Name, lat and lng are required");
      }
      const res = await adminFetch(`${apiBase}/api/v1/admin/hospitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          lat,
          lng,
          address: form.address || undefined,
          city: form.city || undefined,
          phone: form.phone || undefined,
          isDefault: form.isDefault
        })
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "create_failed");
      setForm(blank);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {err ? <div className="card" style={{ color: "#B91C1C" }}>{err}</div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)" }}>
              <th style={{ padding: "6px 8px" }}>Name</th>
              <th style={{ padding: "6px 8px" }}>Lat, Lng</th>
              <th style={{ padding: "6px 8px" }}>City</th>
              <th style={{ padding: "6px 8px" }}>Default</th>
              <th style={{ padding: "6px 8px" }}>Active</th>
              <th style={{ padding: "6px 8px" }}>Edit pin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <HospitalRow key={h.id} h={h} busy={busy} onPatch={patch} />
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="muted" style={{ padding: 12 }}>No hospitals yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add hospital</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} />
          <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inp} />
          <input placeholder="Latitude" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} style={inp} />
          <input placeholder="Longitude" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} style={inp} />
          <input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={{ ...inp, gridColumn: "1 / -1" }} />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inp} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
            Set as default destination
          </label>
        </div>
        <button onClick={create} disabled={busy} style={{ marginTop: 12, fontWeight: 600, padding: "8px 16px", border: "none", borderRadius: 6, background: "var(--accent)", color: "#fff", cursor: "pointer" }}>
          {busy ? "Saving…" : "Add hospital"}
        </button>
      </div>
    </div>
  );
}

function HospitalRow({ h, busy, onPatch }: { h: Hospital; busy: boolean; onPatch: (id: string, body: Record<string, unknown>) => void }) {
  const [lat, setLat] = useState(String(h.lat));
  const [lng, setLng] = useState(String(h.lng));
  const dirty = lat !== String(h.lat) || lng !== String(h.lng);
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{h.name}</td>
      <td style={{ padding: "6px 8px" }} className="mono">{h.lat.toFixed(4)}, {h.lng.toFixed(4)}</td>
      <td style={{ padding: "6px 8px" }}>{h.city ?? "—"}</td>
      <td style={{ padding: "6px 8px" }}>
        {h.isDefault ? (
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#DCFCE7", color: "#166534" }}>DEFAULT</span>
        ) : (
          <button disabled={busy} onClick={() => onPatch(h.id, { isDefault: true })} style={miniBtn}>Make default</button>
        )}
      </td>
      <td style={{ padding: "6px 8px" }}>
        <button disabled={busy} onClick={() => onPatch(h.id, { active: !h.active })} style={miniBtn}>
          {h.active ? "Active ✓" : "Inactive"}
        </button>
      </td>
      <td style={{ padding: "6px 8px", display: "flex", gap: 4, alignItems: "center" }}>
        <input value={lat} onChange={(e) => setLat(e.target.value)} style={{ ...inp, width: 90 }} />
        <input value={lng} onChange={(e) => setLng(e.target.value)} style={{ ...inp, width: 90 }} />
        {dirty ? (
          <button
            disabled={busy}
            onClick={() => onPatch(h.id, { lat: Number(lat), lng: Number(lng) })}
            style={{ ...miniBtn, background: "var(--accent)", color: "#fff", border: "none" }}
          >
            Save
          </button>
        ) : null}
      </td>
    </tr>
  );
}

const inp: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 13
};
const miniBtn: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 10px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer"
};
