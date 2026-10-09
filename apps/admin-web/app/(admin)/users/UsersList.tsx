"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";
import { downloadCsv } from "../../../lib/csv";
import { DateRangePicker, DateRange, Preset, presetToRange } from "../DateRange";

type User = {
  id: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  pictureUrl?: string | null;
  authProvider?: string | null;
  bloodGroup?: string | null;
  allergies?: string | null;
  emergencyContact?: string | null;
  isDemo?: boolean;
  disabled?: boolean;
  createdAt: string;
};

export function UsersList({ initialUsers, initialError, apiBase }: { initialUsers: User[]; initialError?: string; apiBase: string }) {
  const [loadError, setLoadError] = useState(initialError ?? "");
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<User[]>(initialUsers);
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState<DateRange>(presetToRange("30d"));

  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([""]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [summary, setSummary] = useState<{ total: number; disabled: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const cursor = cursors[cursors.length - 1];
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setCursors([""]); }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const paramsFor = (next = "", limit = 100) => {
    const params = new URLSearchParams({ limit: String(limit) });
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
        const res = await adminFetch(`${apiBase}/api/v1/admin/users?${paramsFor(cursor)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`User updates are unavailable (${res.status}). Showing the last loaded data. Retrying automatically.`);
        const data = await res.json();
        if (alive) { setRows(data.users); setNextCursor(data.nextCursor); setTotal(data.total); setSummary(data.summary); setLoadError(""); }
      } catch (error) {
        if (alive) setLoadError(error instanceof Error ? error.message : "User updates are unavailable. Retrying automatically.");
      } finally { running = false; if (alive) setLoading(false); }
    };
    void fetchRows();
    const id = setInterval(fetchRows, 5000);
    return () => { alive = false; clearInterval(id); controller.abort(); };
  }, [apiBase, range.since, range.until, search, cursor]);
  const filtered = rows;
  const exportCsv = async () => {
    setExporting(true);
    try {
      const exportRows: User[] = [];
      let next = "";
      do {
        const res = await adminFetch(`${apiBase}/api/v1/admin/users?${paramsFor(next, 500)}`);
        if (!res.ok) throw new Error(`CSV export failed (${res.status}). Please retry.`);
        const data = await res.json();
        exportRows.push(...data.users);
        next = data.nextCursor ?? "";
      } while (next);
    downloadCsv(exportRows, [
      { header: "User ID", value: (u) => u.id },
      { header: "Phone", value: (u) => u.phone },
      { header: "Email", value: (u) => u.email ?? "" },
      { header: "Auth provider", value: (u) => u.authProvider ?? "" },
      { header: "Name", value: (u) => u.name ?? "" },
      { header: "Blood group", value: (u) => u.bloodGroup ?? "" },
      { header: "Allergies", value: (u) => u.allergies ?? "" },
      { header: "Emergency contact", value: (u) => u.emergencyContact ?? "" },
      { header: "Joined (IST)", value: (u) => formatIST(u.createdAt) },
      { header: "Disabled", value: (u) => u.disabled ? "Yes" : "No" }
    ], "jr-users");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "CSV export failed. Please retry."); }
    finally { setExporting(false); }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>{summary ? `${summary.total} in range · ${summary.disabled} disabled` : "Loading user totals…"}</p>
        </div>
        <button onClick={exportCsv} disabled={exporting} style={{ background: "transparent", border: "1px solid var(--border, #E2E8F0)", color: "var(--ink, #0F172A)", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{exporting ? "Preparing CSV…" : "Download CSV"}</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); setCursors([""]); }} />
      </div>

      {loadError ? <div role="alert" className="card" style={{ marginBottom: 12, color: "var(--danger)" }}>{loadError}</div> : null}
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search name, phone, or email…"
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
                <th>Blood group</th>
                <th>Joined</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: 24, textAlign: "center" }}>
                    {loading ? "Loading users…" : loadError ? "User records could not be loaded." : "No users match the current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {u.pictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.pictureUrl} alt="" width={24} height={24} style={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                        ) : null}
                        <strong>{u.name ?? "Unnamed"}</strong>
                        {u.authProvider === "google" ? (
                          <span title="Signed in with Google" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(66, 133, 244, 0.10)", color: "#1A73E8", fontWeight: 700, letterSpacing: 0.3 }}>G</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      {u.email ? (
                        <div style={{ fontSize: 13 }}>{u.email}</div>
                      ) : null}
                      <div className="mono muted" style={{ fontSize: 12 }}>{u.phone}</div>
                    </td>
                    <td>{u.bloodGroup ?? <span className="muted">-</span>}</td>
                    <td className="mono muted">{formatIST(u.createdAt)}</td>
                    <td>
                      {u.disabled
                        ? <span className="pill cancelled">Disabled</span>
                        : <span className="pill completed">Active</span>}
                    </td>
                    <td>
                      <Link href={`/users/${u.id}`} style={{ color: "var(--accent)", fontSize: 12 }}>Open →</Link>
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
