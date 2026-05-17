"use client";

import React, { useEffect, useMemo, useState } from "react";
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

export function UsersList({ initialUsers, apiBase }: { initialUsers: User[]; apiBase: string }) {
  const [query, setQuery] = useState<string>("");
  const [rows, setRows] = useState<User[]>(initialUsers);
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
        const res = await adminFetch(`${apiBase}/api/v1/admin/users${qs ? "?" + qs : ""}`);
        const data = await res.json();
        if (!alive) return;
        setRows(data.users ?? []);
      } catch {
        /* keep last good */
      }
    };
    void fetchRows();
    const id = setInterval(fetchRows, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase, range.since, range.until]);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        u.phone.includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
    );
  }, [rows, query]);

  const disabledCount = rows.filter((r) => r.disabled).length;

  const exportCsv = () => {
    downloadCsv(filtered, [
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
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>{rows.length} in range{disabledCount > 0 ? ` · ${disabledCount} disabled` : ""}</p>
        </div>
        <button onClick={exportCsv} style={{ background: "transparent", border: "1px solid var(--border, #E2E8F0)", color: "var(--ink, #0F172A)", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⬇ Download CSV</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search name, phone, or email…"
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
                    No users match the current filters.
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
                    <td>{u.bloodGroup ?? <span className="muted">—</span>}</td>
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
    </>
  );
}
