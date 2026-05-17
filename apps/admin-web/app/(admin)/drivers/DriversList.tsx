"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Source, SourceFilter } from "../SourceFilter";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";

type Driver = {
  id: string;
  phone: string;
  name?: string | null;
  licenseNumber?: string | null;
  vehicleNumber?: string | null;
  vehicleType?: string | null;
  status: string;
  kycVerified: boolean;
  rating: number;
  lastSeenAt?: string | null;
  isDemo?: boolean;
  disabled?: boolean;
};

export function DriversList({ initialDrivers, apiBase }: { initialDrivers: Driver[]; apiBase: string }) {
  const [source, setSource] = useState<Source>("all");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<Driver[]>(initialDrivers);

  useEffect(() => {
    let alive = true;
    const fetchRows = async () => {
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/drivers?source=${source}`);
        const data = await res.json();
        if (!alive) return;
        setRows(data.drivers ?? []);
      } catch {
        /* keep last good */
      }
    };
    void fetchRows();
    const id = setInterval(fetchRows, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase, source]);

  const filtered = useMemo(() => {
    let out = rows;
    if (status !== "all") out = out.filter((d) => d.status === status);
    if (query) {
      const q = query.toLowerCase();
      out = out.filter(
        (d) =>
          (d.name ?? "").toLowerCase().includes(q) ||
          d.phone.includes(q) ||
          (d.vehicleNumber ?? "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, status, query]);

  const onlineCount = rows.filter((d) => d.status !== "OFFLINE").length;
  const onTripCount = rows.filter((d) => d.status === "ON_TRIP").length;
  const realCount = rows.filter((d) => !d.isDemo).length;
  const demoCount = rows.filter((d) => d.isDemo).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Drivers</h1>
          <p>{rows.length} total · {onlineCount} online · {onTripCount} on trip · {realCount} real · {demoCount} demo</p>
        </div>
        <SourceFilter value={source} onChange={setSource} />
      </div>

      <div className="filter-bar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="ON_TRIP">On trip</option>
          <option value="OFFLINE">Offline</option>
        </select>
        <input
          type="text"
          placeholder="Search name, phone, vehicle…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} match</span>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Vehicle</th>
                <th>KYC</th>
                <th>Rating</th>
                <th>Last seen</th>
                <th>Status</th>
                <th>Source</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="muted" style={{ padding: 24, textAlign: "center" }}>
                    No drivers match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className={`dot ${d.status === "OFFLINE" ? "down" : "up"}`} />
                        <strong>{d.name ?? "Unnamed"}</strong>
                        {d.disabled ? <span className="pill cancelled" style={{ marginLeft: 4 }}>Disabled</span> : null}
                      </div>
                    </td>
                    <td className="mono muted">{d.phone}</td>
                    <td>
                      <div>{d.vehicleNumber ?? "—"}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{d.vehicleType ?? "BLS"}</div>
                    </td>
                    <td>
                      <span className={`pill ${d.kycVerified ? "completed" : "requested"}`}>
                        {d.kycVerified ? "Verified" : "Pending"}
                      </span>
                    </td>
                    <td>⭐ {d.rating?.toFixed(1) ?? "5.0"}</td>
                    <td className="mono muted">{d.lastSeenAt ? formatIST(d.lastSeenAt) : "—"}</td>
                    <td>
                      <span className={`pill ${d.status.toLowerCase() === "on_trip" ? "accepted" : d.status === "AVAILABLE" ? "completed" : "cancelled"}`}>
                        {d.status === "ON_TRIP" ? "On trip" : d.status === "AVAILABLE" ? "Available" : "Offline"}
                      </span>
                    </td>
                    <td>
                      {d.isDemo ? <span className="demo-flag">DEMO</span> : <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600, letterSpacing: 0.4 }}>REAL</span>}
                    </td>
                    <td>
                      <Link href={`/drivers/${d.id}`} style={{ color: "var(--accent)", fontSize: 12 }}>Open →</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
