"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatTimeIST } from "../../../../lib/dates";
import { useHospitalSocket } from "../../HospitalSocketProvider";

type Counts = { total: number; online: number; onTrip: number };

type DriverRow = {
  id: string;
  name?: string | null;
  vehicle_number?: string | null;
  status: string;
  is_primary?: boolean;
};

const POLL_MS = 10000;

const STATUS_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  AVAILABLE: { label: "Online", bg: "rgba(16,185,129,0.12)", fg: "#065F46" },
  ON_TRIP: { label: "On trip", bg: "rgba(6,182,212,0.14)", fg: "#0E7490" },
  OFFLINE: { label: "Offline", bg: "rgba(148,163,184,0.18)", fg: "#475569" }
};

export function HospitalDriversLive() {
  const [counts, setCounts] = useState<Counts>({ total: 0, online: 0, onTrip: 0 });
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const { subscribe } = useHospitalSocket();
  const aliveRef = useRef(true);

  const fetchAll = useCallback(async () => {
    try {
      const [meRes, drvRes] = await Promise.all([
        fetch("/api/hospital-proxy/api/v1/hospital/me", { cache: "no-store" }),
        fetch("/api/hospital-proxy/api/v1/hospital/drivers", { cache: "no-store" })
      ]);
      if (!aliveRef.current) return;
      if (meRes.ok) {
        const me = await meRes.json();
        if (me?.counts) setCounts(me.counts);
      }
      if (drvRes.ok) {
        const json = await drvRes.json();
        setDrivers(Array.isArray(json.drivers) ? json.drivers : []);
      }
      setUpdatedAt(Date.now());
      setLoaded(true);
    } catch {
      /* keep last good */
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void fetchAll();
    const id = setInterval(fetchAll, POLL_MS);
    // A booking update can flip a driver to ON_TRIP / free it — refetch live.
    const unsub = subscribe("hospital:booking_update", () => {
      void fetchAll();
    });
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      unsub();
    };
  }, [fetchAll, subscribe]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Kpi label="Total drivers" value={counts.total} />
        <Kpi label="Online now" value={counts.online} tone="var(--success)" />
        <Kpi label="On trip" value={counts.onTrip} tone="#0E7490" />
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Drivers · {drivers.length}</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
            Live · refreshed {formatTimeIST(updatedAt)}
          </span>
        </div>
        {!loaded ? (
          <div className="muted">Loading drivers…</div>
        ) : drivers.length === 0 ? (
          <div className="muted">No drivers are tagged to your hospital yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" }}>
                <th style={{ padding: "8px 8px 8px 0" }}>Driver</th>
                <th style={{ padding: 8 }}>Ambulance</th>
                <th style={{ padding: 8 }}>Status</th>
                <th style={{ padding: 8 }}>Primary</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const chip = STATUS_CHIP[d.status] ?? { label: d.status, bg: "rgba(148,163,184,0.18)", fg: "#475569" };
                return (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 8px 10px 0", fontWeight: 500 }}>{d.name ?? "—"}</td>
                    <td style={{ padding: 10 }}>{d.vehicle_number ?? "—"}</td>
                    <td style={{ padding: 10 }}>
                      <span style={{ background: chip.bg, color: chip.fg, fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 999 }}>{chip.label}</span>
                    </td>
                    <td style={{ padding: 10 }}>{d.is_primary ? "★" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card" style={{ textAlign: "left" }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, color: tone ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}
