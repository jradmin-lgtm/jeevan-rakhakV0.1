"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  driverCount?: number;
  bookingCount?: number;
  portalUsername?: string | null;
  portalEnabled?: boolean;
  portalPasswordPlain?: string | null;
};

const blank = { name: "", lat: "", lng: "", address: "", city: "", phone: "", isDefault: false };

/** Mirror of the server-side slugify — default Login ID when no portalUsername is set yet. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

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

  const portalPut = async (id: string, body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/hospitals/${id}/portal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const code = (await res.json().catch(() => null))?.error;
        throw new Error(code === "username_taken" ? "That Login ID is already taken." : code ?? "portal_update_failed");
      }
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Portal update failed");
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
              <th style={{ padding: "6px 8px" }}>Drivers</th>
              <th style={{ padding: "6px 8px" }}>Bookings</th>
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
              <tr><td colSpan={7} className="muted" style={{ padding: 12 }}>No hospitals yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Hospital Portal Logins</h3>
        <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
          Each hospital can sign in to its own portal at <span className="mono">/hospital-login</span>. The Login ID
          defaults to the hospital name slug. Set or reset the password below — it stays viewable here.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)" }}>
              <th style={{ padding: "6px 8px" }}>Hospital</th>
              <th style={{ padding: "6px 8px" }}>Login ID</th>
              <th style={{ padding: "6px 8px" }}>Password</th>
              <th style={{ padding: "6px 8px" }}>Access</th>
              <th style={{ padding: "6px 8px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <PortalRow key={h.id} h={h} busy={busy} onPortalPut={portalPut} />
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="muted" style={{ padding: 12 }}>No hospitals yet.</td></tr>
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
      <td style={{ padding: "6px 8px", fontWeight: 600 }}>
        <Link href={`/hospitals/${h.id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>{h.name}</Link>
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{h.lat.toFixed(4)}, {h.lng.toFixed(4)}</div>
      </td>
      <td style={{ padding: "6px 8px" }}>{h.driverCount ?? 0}</td>
      <td style={{ padding: "6px 8px" }}>{h.bookingCount ?? 0}</td>
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

function PortalRow({
  h,
  busy,
  onPortalPut
}: {
  h: Hospital;
  busy: boolean;
  onPortalPut: (id: string, body: Record<string, unknown>) => void;
}) {
  const loginId = h.portalUsername ?? slugify(h.name);
  const hasPassword = Boolean(h.portalPasswordPlain);
  const enabled = h.portalEnabled ?? false;
  const [pw, setPw] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const tooShort = pw.length > 0 && pw.length < 8;
  const canSave = pw.length >= 8 && !busy;

  const save = () => {
    if (!canSave) return;
    onPortalPut(h.id, { password: pw, enabled: true });
    setPw("");
  };

  const copy = async () => {
    if (!h.portalPasswordPlain) return;
    try {
      await navigator.clipboard.writeText(h.portalPasswordPlain);
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{h.name}</td>
      <td style={{ padding: "6px 8px" }}>
        <span className="mono">{loginId}</span>
      </td>
      <td style={{ padding: "6px 8px" }}>
        {hasPassword ? (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span className="mono">{h.portalPasswordPlain}</span>
            <button disabled={busy} onClick={copy} style={miniBtn}>{copied ? "Copied ✓" : "Copy"}</button>
          </span>
        ) : (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <input
              type="text"
              placeholder="Set password (min 8)"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              style={{ ...inp, width: 170, borderColor: tooShort ? "#B91C1C" : "var(--border)" }}
            />
            <button
              disabled={!canSave}
              onClick={save}
              style={{ ...miniBtn, background: canSave ? "var(--accent)" : "#fff", color: canSave ? "#fff" : "var(--muted)", border: canSave ? "none" : "1px solid var(--border)" }}
            >
              Save
            </button>
          </span>
        )}
      </td>
      <td style={{ padding: "6px 8px" }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 999,
              background: enabled ? "#DCFCE7" : "#FEE2E2",
              color: enabled ? "#166534" : "#B91C1C"
            }}
          >
            {enabled ? "Enabled" : "Disabled"}
          </span>
          <button disabled={busy} onClick={() => onPortalPut(h.id, { enabled: !enabled })} style={miniBtn}>
            {enabled ? "Disable" : "Enable"}
          </button>
        </span>
      </td>
      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          {hasPassword ? <ResetPassword h={h} busy={busy} onPortalPut={onPortalPut} /> : null}
          {hasPassword ? (
            <button
              disabled={busy}
              onClick={() => {
                if (confirm(`Delete the portal password for ${h.name}? They will not be able to sign in until you set a new one.`)) {
                  onPortalPut(h.id, { clear: true });
                }
              }}
              style={{ ...miniBtn, color: "#B91C1C", borderColor: "#FCA5A5" }}
            >
              Delete
            </button>
          ) : null}
          <a href="/hospital-login" target="_blank" rel="noopener noreferrer" style={{ ...miniBtn, textDecoration: "none", color: "var(--accent)" }}>
            Open ↗
          </a>
        </span>
      </td>
    </tr>
  );
}

function ResetPassword({
  h,
  busy,
  onPortalPut
}: {
  h: Hospital;
  busy: boolean;
  onPortalPut: (id: string, body: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const canSave = pw.length >= 8 && !busy;
  const tooShort = pw.length > 0 && pw.length < 8;

  if (!open) {
    return (
      <button disabled={busy} onClick={() => setOpen(true)} style={miniBtn}>Reset</button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <input
        type="text"
        placeholder="New password (min 8)"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        style={{ ...inp, width: 170, borderColor: tooShort ? "#B91C1C" : "var(--border)" }}
      />
      <button
        disabled={!canSave}
        onClick={() => {
          if (!canSave) return;
          onPortalPut(h.id, { password: pw, enabled: true });
          setPw("");
          setOpen(false);
        }}
        style={{ ...miniBtn, background: canSave ? "var(--accent)" : "#fff", color: canSave ? "#fff" : "var(--muted)", border: canSave ? "none" : "1px solid var(--border)" }}
      >
        Save
      </button>
      <button disabled={busy} onClick={() => { setPw(""); setOpen(false); }} style={miniBtn}>Cancel</button>
    </span>
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
