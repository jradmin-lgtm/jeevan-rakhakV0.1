"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../../lib/adminFetch";

type Driver = {
  id: string;
  name?: string | null;
  phone: string;
  vehicleNumber?: string | null;
  vehicleType?: string | null;
  kycVerified?: boolean;
  status?: string;
  isPrimary?: boolean;
};

/**
 * v1.1.2 — drivers assigned to this hospital, with add/remove. Assigning a
 * driver here adds the hospital to that driver's assignment set (many-to-many,
 * so it never unassigns them elsewhere). Mirrors to the app on next refresh.
 */
export function HospitalDrivers({
  hospitalId,
  apiBase,
  initial
}: {
  hospitalId: string;
  apiBase: string;
  initial: Driver[];
}) {
  const [drivers, setDrivers] = useState<Driver[]>(initial);
  const [allDrivers, setAllDrivers] = useState<Driver[] | null>(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      try {
        const rows: Driver[] = [];
        let cursor = "";
        do {
          const params = new URLSearchParams({ limit: "500" });
          if (cursor) params.set("cursor", cursor);
          const res = await adminFetch(`${apiBase}/api/v1/admin/drivers?${params}`, { signal: controller.signal });
          if (!res.ok) throw new Error("Drivers could not be loaded. Reload this page to retry.");
          const data = await res.json();
          rows.push(...data.drivers);
          cursor = data.nextCursor ?? "";
        } while (cursor);
        if (alive) setAllDrivers(rows);
      } catch (error) {
        if (alive) setError(error instanceof Error ? error.message : "Drivers could not be loaded.");
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, [apiBase]);

  const refresh = async () => {
    const res = await adminFetch(`${apiBase}/api/v1/admin/hospitals/${hospitalId}`);
    if (!res.ok) throw new Error("Assignments could not refresh. Reload this page to check the current assignments.");
    setDrivers((await res.json()).drivers);
  };

  const assign = async () => {
    if (!pick || busy) return;
    setBusy(true); setError("");
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/hospitals/${hospitalId}/drivers`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverId: pick })
      });
      if (!res.ok) throw new Error(`Driver assignment failed (${res.status}). Please retry.`);
      setPick("");
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Driver assignment failed."); }
    finally { setBusy(false); }
  };

  const remove = async (driverId: string) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/hospitals/${hospitalId}/drivers/${driverId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Driver removal failed (${res.status}). Please retry.`);
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Driver removal failed."); }
    finally { setBusy(false); }
  };

  const assignedIds = new Set(drivers.map((d) => d.id));
  const assignable = (allDrivers ?? []).filter((d) => !assignedIds.has(d.id));

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ marginTop: 0 }}>Drivers assigned to this hospital</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, fontSize: 13, maxWidth: 220 }}>
            <option value="">{allDrivers === null ? "Loading drivers…" : "Assign a driver…"}</option>
            {assignable.map((d) => (
              <option key={d.id} value={d.id}>{d.name ?? d.phone} · {d.vehicleNumber ?? "no vehicle"}</option>
            ))}
          </select>
          <button onClick={assign} disabled={busy || !pick} style={{ fontSize: 13, fontWeight: 600, padding: "6px 14px", border: "none", borderRadius: 6, background: "var(--accent)", color: "#fff", cursor: pick ? "pointer" : "default", opacity: pick ? 1 : 0.6 }}>
            Assign
          </button>
        </div>
      </div>
      {error ? <p role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--muted)" }}>
            <th style={{ padding: "6px 8px" }}>Name</th>
            <th style={{ padding: "6px 8px" }}>Phone</th>
            <th style={{ padding: "6px 8px" }}>Vehicle</th>
            <th style={{ padding: "6px 8px" }}>KYC</th>
            <th style={{ padding: "6px 8px" }}>Primary</th>
            <th style={{ padding: "6px 8px" }}></th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 8px" }}>
                <Link href={`/drivers/${d.id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>{d.name ?? "-"}</Link>
              </td>
              <td style={{ padding: "6px 8px" }}>{d.phone}</td>
              <td style={{ padding: "6px 8px" }}>{d.vehicleNumber ?? "-"} {d.vehicleType ? `(${d.vehicleType})` : ""}</td>
              <td style={{ padding: "6px 8px" }}>{d.kycVerified ? "✓" : "pending"}</td>
              <td style={{ padding: "6px 8px" }}>{d.isPrimary ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#DCFCE7", color: "#166534" }}>PRIMARY</span> : ""}</td>
              <td style={{ padding: "6px 8px" }}>
                <button onClick={() => remove(d.id)} disabled={busy} style={{ fontSize: 12, padding: "4px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#B91C1C" }}>Remove</button>
              </td>
            </tr>
          ))}
          {drivers.length === 0 ? <tr><td colSpan={6} className="muted" style={{ padding: 12 }}>No drivers assigned yet · use the dropdown above.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
