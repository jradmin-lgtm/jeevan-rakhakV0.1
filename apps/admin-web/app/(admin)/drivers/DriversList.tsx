"use client";

import React, { useEffect, useState } from "react";
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
  ratingCount?: number;
  lastSeenAt?: string | null;
  isDemo?: boolean;
  disabled?: boolean;
};

export function DriversList({ initialDrivers, initialError, apiBase }: { initialDrivers: Driver[]; initialError?: string; apiBase: string }) {
  const [loadError, setLoadError] = useState(initialError ?? "");
  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<Driver[]>(initialDrivers);
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState<DateRange>(presetToRange("30d"));

  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([""]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ total: number; online: number; onTrip: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cursor = cursors[cursors.length - 1];
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setCursors([""]); }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const paramsFor = (next = "", limit = 100) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (status !== "all") params.set("status", status);
    if (range.since) params.set("since", range.since);
    if (range.until) params.set("until", range.until);
    if (search) params.set("q", search);
    if (next) params.set("cursor", next);
    return params;
  };
  useEffect(() => {
    let alive = true, running = false;
    const controller = new AbortController();
    const fetchRows = async () => {
      if (running) return;
      running = true; setLoading(true);
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/drivers?${paramsFor(cursor)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Driver updates are unavailable (${res.status}). Showing the last loaded data. Retrying automatically.`);
        const data = await res.json();
        if (alive) { setRows(data.drivers); setNextCursor(data.nextCursor); setTotal(data.total); setSummary(data.summary); setLoadError(""); }
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "Driver updates are unavailable. Retrying automatically.");
      } finally { running = false; if (alive) setLoading(false); }
    };
    void fetchRows();
    const id = setInterval(fetchRows, 5000);
    return () => { alive = false; clearInterval(id); controller.abort(); };
  }, [apiBase, status, range.since, range.until, search, cursor]);
  const filtered = rows;
  const exportCsv = async () => {
    setExporting(true);
    try {
      const exportRows: Driver[] = [];
      let next = "";
      do {
        const res = await adminFetch(`${apiBase}/api/v1/admin/drivers?${paramsFor(next, 500)}`);
        if (!res.ok) throw new Error(`CSV export failed (${res.status}). Please retry.`);
        const data = await res.json();
        exportRows.push(...data.drivers);
        next = data.nextCursor ?? "";
      } while (next);
    downloadCsv(exportRows, [
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
      { header: "Rating", value: (d) => (d.ratingCount ?? 0) > 0 ? d.rating.toFixed(1) : "Not rated" },
      { header: "Last seen (IST)", value: (d) => d.lastSeenAt ? formatIST(d.lastSeenAt) : "" }
    ], "jr-drivers");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "CSV export failed. Please retry."); }
    finally { setExporting(false); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Drivers</h1>
          <p>{summary ? `${summary.total} in range · ${summary.online} online · ${summary.onTrip} on trip` : "Loading driver totals…"}</p>
        </div>
        <button onClick={exportCsv} disabled={exporting} style={{ background: "transparent", border: "1px solid var(--border, #E2E8F0)", color: "var(--ink, #0F172A)", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{exporting ? "Preparing CSV…" : "Download CSV"}</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); setCursors([""]); }} />
      </div>

      {loadError ? <div role="alert" className="card" style={{ marginBottom: 12, color: "var(--danger)" }}>{loadError}</div> : null}
      <div className="filter-bar">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setCursors([""]); }}>
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
        <span className="muted" style={{ fontSize: 12 }}>{total === null ? "Loading…" : `${total} match · ${rows.length} on this page`}</span>
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
                    {loading ? "Loading drivers…" : loadError ? "Driver records could not be loaded." : "No drivers match the current filters."}
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
                      <div>{d.vehicleNumber ?? "-"}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{d.vehicleType ?? "BLS"}</div>
                    </td>
                    <td>
                      <span className={`pill ${d.kycVerified ? "completed" : "requested"}`}>
                        {d.kycVerified ? "Verified" : "Pending"}
                      </span>
                    </td>
                    <td>{(d.ratingCount ?? 0) > 0 ? `★ ${d.rating.toFixed(1)}` : "Not rated"}</td>
                    <td className="mono muted">{d.lastSeenAt ? formatIST(d.lastSeenAt) : "-"}</td>
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
      <div style={{ display: "flex", gap: 16, alignItems: "center", justifyContent: "center", padding: 16 }}>
        <button disabled={cursors.length === 1 || loading} onClick={() => setCursors((v) => v.slice(0, -1))}>Previous</button>
        <span>Page {cursors.length}</span>
        <button disabled={!nextCursor || loading} onClick={() => { if (nextCursor) setCursors((v) => [...v, nextCursor]); }}>Next</button>
      </div>
    </>
  );
}
