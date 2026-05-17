"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";

type User = {
  id: string;
  phone: string;
  name?: string | null;
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

  useEffect(() => {
    let alive = true;
    const fetchRows = async () => {
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/users`);
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
  }, [apiBase]);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter(
      (u) =>
        (u.name ?? "").toLowerCase().includes(q) ||
        u.phone.includes(q)
    );
  }, [rows, query]);

  const disabledCount = rows.filter((r) => r.disabled).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Users</h1>
          <p>{rows.length} total{disabledCount > 0 ? ` · ${disabledCount} disabled` : ""}</p>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search name or phone…"
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
                    <td><strong>{u.name ?? "Unnamed"}</strong></td>
                    <td className="mono muted">{u.phone}</td>
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
