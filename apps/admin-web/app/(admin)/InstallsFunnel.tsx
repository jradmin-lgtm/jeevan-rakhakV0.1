"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";

/**
 * Compact app-install funnel for the Live dashboard, fed by the public
 * download portal (/download-apk) analytics. Polls every 30s with the
 * keep-last-good discipline. Deep-links into the full App installs board.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const POLL_MS = 30_000;

type Row = { app: string | null; n: number };
type FunnelRow = { app: string; downloads: number; matched_signups: number };
type D = { visits: number; downloads: Row[]; requested: Row[]; funnel: FunnelRow[] };

export function InstallsFunnel({ initial }: { initial: D }) {
  const [d, setD] = useState<D>(initial);

  useEffect(() => {
    const tick = async () => {
      try {
        const res = await adminFetch(`${API_BASE}/api/v1/admin/app-events`);
        if (!res.ok) return; // keep last good
        const j = await res.json();
        setD({ visits: j.visits ?? 0, downloads: j.downloads ?? [], requested: j.requested ?? [], funnel: j.funnel ?? [] });
      } catch { /* keep last good */ }
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const totalDl = (d.downloads || []).reduce((s, r) => s + r.n, 0);
  const totalReq = (d.requested || []).reduce((s, r) => s + r.n, 0);
  const signups = (d.funnel || []).reduce((s, f) => s + f.matched_signups, 0);
  const per = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);
  const max = Math.max(1, d.visits, totalReq, totalDl, signups);

  const stages = [
    { label: "Page visits", n: d.visits, color: "#2563EB", pct: null as number | null },
    { label: "Download requests", n: totalReq, color: "#7C3AED", pct: per(totalReq, d.visits) },
    { label: "Downloads completed", n: totalDl, color: "#0FA47A", pct: per(totalDl, totalReq) },
    { label: "Signed in (matched)", n: signups, color: "#E5322B", pct: per(signups, totalDl) },
  ];

  return (
    <>
      <h3 className="section-title">App install funnel · from the download portal</h3>
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 18 }}>
          {stages.map((s, i) => (
            <div key={s.label} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span className="muted" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  {s.label}
                </span>
                {s.pct !== null ? (
                  <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap" }}>{s.pct}% of prev</span>
                ) : null}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "4px 0 8px", fontVariantNumeric: "tabular-nums" }}>
                {s.n}
              </div>
              <div style={{ height: 7, borderRadius: 99, background: "var(--bg-deep)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.max(4, (s.n / max) * 100)}%`,
                    height: "100%",
                    borderRadius: 99,
                    background: s.color,
                    opacity: s.n > 0 ? 1 : 0.25,
                    transition: "width .6s ease",
                  }}
                />
              </div>
              {i === 2 ? (
                <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                  user {(d.downloads.find((r) => r.app === "user")?.n ?? 0)} · driver {(d.downloads.find((r) => r.app === "driver")?.n ?? 0)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border-soft)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Live from jr-admin.vercel.app/download-apk · refreshes every 30s</span>
          <a href="/app-installs" style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)" }}>
            Open App installs →
          </a>
        </div>
      </div>
    </>
  );
}
