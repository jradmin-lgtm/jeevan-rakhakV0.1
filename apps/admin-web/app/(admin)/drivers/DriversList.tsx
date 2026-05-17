"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";
import { downloadCsv } from "../../../lib/csv";
import { DateRangePicker, DateRange, Preset, presetToRange } from "../DateRange";

type Driver = {
  id: string;
  phone: string;
  email?: string | null;
  authProvider?: string | null;
  pictureUrl?: string | null;
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
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<Driver[]>(initialDrivers);
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState<DateRange>(presetToRange("30d"));

  useEffect(() => {
    let alive = true;
    const fetchRows = async () => {
      try {
        const params = new URLSearchParams();
        if (range.since) params.set("since", range.since);
        if (range.until) params.set("until", range.until);
        const qs = params.toString();
        const res = await adminFetch(`${apiBase}/api/v1/admin/drivers${qs ? "?" + qs : ""}`);
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
  }, [apiBase, range.since, range.until]);

  const filtered = useMemo(() => {
    let out = rows;
    if (status !== "all") out = out.filter((d) => d.status === status);
    if (query) {
      const q = query.toLowerCase();
      out = out.filter(
        (d) =>
          (d.name ?? "").toLowerCase().includes(q) ||
          d.phone.includes(q) ||
          (d.vehicleNumber ?? "").toLowerCase().includes(q) ||
          (d.email ?? "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, status, query]);

  const onlineCount = rows.filter((d) => d.status !== "OFFLINE").length;
  const onTripCount = rows.filter((d) => d.status === "ON_TRIP").length;

  const exportCsv = () => {
    downloadCsv(filtered, [
      { header: "Driver ID", value: (d) => d.id },
      { header: "Phone", value: (d) => d.phone },
      { header: "Email", value: (d) => d.email ?? "" },
      { header: "Auth provider", value: (d) => d.authProvider ?? "" },
      { header: "Name", value: (d) => d.name ?? "" },
      { header: "Vehicle", value: (d) => d.vehicleNumber ?? "" },
      { header: "Type", value: (d) => d.vehicleType ?? "" },
      { header: "Licence", value: (d) => d.licenseNumber ?? "" },
      { header: "Status", value: (d) => d.status },
      { header: "KYC", value: (d) => d.kycVerified ? "Verified" : "Pending" },
      { header: "Rating", value: (d) => d.rating?.toFixed(1) ?? "" },
      { header: "Last seen (IST)", value: (d) => d.lastSeenAt ? formatIST(d.lastSeenAt) : "" }
    ], "jr-drivers");
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Drivers</h1>
          <p>{rows.length} in range · {onlineCount} online · {onTripCount} on trip</p>
        </div>
        <button onClick={exportCsv} style={{ background: "transparent", border: "1px solid var(--border, #E2E8F0)", color: "var(--ink, #0F172A)", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⬇ Download CSV</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
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
          placeholder="Search name, phone, vehicle, email…"
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
                <th>Email · Phone</th>
                <th>Vehicle</th>
                <th>KYC</th>
                <th>Rating</th>
                <th>Last seen</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="muted" style={{ padding: 24, textAlign: "center" }}>
                    No drivers match the current filters.
                  </td>
                </tr>
              ) : (
                filtered.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {!d.disabled ? <span className={`dot ${d.status === "OFFLINE" ? "down" : "up"}`} /> : null}
                        {d.pictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.pictureUrl} alt="" width={24} height={24} style={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                        ) : null}
                        <strong style={d.disabled ? { color: "var(--muted)", textDecoration: "line-through" } : undefined}>
                          {d.name ?? "Unnamed"}
                        </strong>
                        {d.authProvider === "google" ? (
                          <span title="Signed in with Google" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(66, 133, 244, 0.10)", color: "#1A73E8", fontWeight: 700, letterSpacing: 0.3 }}>G</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {d.email ? <div style={{ fontSize: 13 }}>{d.email}</div> : null}
                      <div className="mono muted" style={{ fontSize: 12 }}>{d.phone}</div>
                    </td>
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
                      {d.disabled ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, background: "#DC2626", color: "#fff", textTransform: "uppercase" }}>
                            Disabled
                          </span>
                          <span style={{ fontSize: 10, color: "var(--muted)" }}>
                            {d.status === "ON_TRIP" ? "was on trip" : d.status === "AVAILABLE" ? "was online" : "was offline"}
                          </span>
                        </div>
                      ) : (
                        <span className={`pill ${d.status.toLowerCase() === "on_trip" ? "accepted" : d.status === "AVAILABLE" ? "completed" : "cancelled"}`}>
                          {d.status === "ON_TRIP" ? "On trip" : d.status === "AVAILABLE" ? "Available" : "Offline"}
                        </span>
                      )}
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
