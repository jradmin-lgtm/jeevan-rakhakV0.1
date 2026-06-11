"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { DateRangePicker, presetToRange, type DateRange, type Preset } from "../DateRange";
import { adminFetch } from "../../../lib/adminFetch";
import { downloadCsv } from "../../../lib/csv";

/**
 * App Installs board. Left (~70%): stat cards, daily activity chart, funnel,
 * recent downloads. Right (~30%): LIVE feedback rail polling every 12s
 * (keep-last-good on failure, per the v1.2.6 poll-wipe rule). Date filter
 * applies to everything; the CSV button dumps the filtered raw events.
 */

type Row = { app: string | null; n: number };
type FunnelRow = { app: string; downloads: number; matched_signups: number };
type Recent = { app: string; contact: string | null; status: string | null; created_at: string };
type Message = { contact: string | null; message: string; created_at: string };
type Daily = { day: string; visits: number; requested: number; downloads: number; messages: number };
type EventRow = {
  type: string; app: string | null; contact: string | null; message: string | null;
  status: string | null; created_at: string; completed_at: string | null;
};
type Data = {
  visits: number; downloads: Row[]; requested: Row[]; recent: Recent[];
  funnel: FunnelRow[]; messages: Message[]; daily: Daily[]; rows: EventRow[];
};

const EMPTY: Data = { visits: 0, downloads: [], requested: [], recent: [], funnel: [], messages: [], daily: [], rows: [] };
const POLL_MS = 12_000;

function byApp(rows: Row[]): Record<string, number> {
  return Object.fromEntries((rows || []).map((r) => [r.app ?? "·", r.n]));
}
function fmt(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return ts; }
}
function fmtDay(d: string): string {
  try { return new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); }
  catch { return d; }
}

const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
  padding: "18px 20px", boxShadow: "var(--shadow-sm)",
};

export function AppInstallsBoard() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState<DateRange>(presetToRange("30d"));
  const [data, setData] = useState<Data>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const load = useCallback(async () => {
    const r = rangeRef.current;
    const qs = new URLSearchParams();
    if (r.since) qs.set("since", r.since);
    if (r.until) qs.set("until", r.until);
    try {
      const res = await adminFetch(`/api/v1/admin/app-events${qs.toString() ? `?${qs}` : ""}`);
      if (!res.ok) return; // keep-last-good: never blank the board on a cold-start 502/401 tick
      const d = await res.json();
      setData({ ...EMPTY, ...d });
      setLoaded(true);
      setUpdatedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch { /* keep last good */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // refetch immediately when the filter changes
  useEffect(() => { load(); }, [range.since, range.until, load]);

  function exportCsv() {
    downloadCsv(
      data.rows,
      [
        { header: "Type", value: (r: EventRow) => r.type },
        { header: "App", value: (r: EventRow) => r.app },
        { header: "Contact", value: (r: EventRow) => r.contact },
        { header: "Message", value: (r: EventRow) => r.message },
        { header: "Status", value: (r: EventRow) => r.status },
        { header: "Created (IST)", value: (r: EventRow) => fmt(r.created_at) },
        { header: "Completed (IST)", value: (r: EventRow) => (r.completed_at ? fmt(r.completed_at) : "") },
      ],
      `app-installs${range.since ? `-${range.since}` : ""}${range.until ? `-to-${range.until}` : ""}`
    );
  }

  const dl = byApp(data.downloads);
  const req = byApp(data.requested);
  const totalDl = (data.downloads || []).reduce((s, r) => s + r.n, 0);
  const totalReq = (data.requested || []).reduce((s, r) => s + r.n, 0);

  const stat = (label: string, value: React.ReactNode, hint?: string, accent?: string) => (
    <div style={{ ...card, borderTop: `3px solid ${accent ?? "var(--border)"}` }}>
      <div style={{ fontSize: 13, color: "var(--muted)", letterSpacing: ".02em" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );

  // ---- chart geometry (pure SVG, no deps) ----
  const days = data.daily || [];
  const maxV = Math.max(1, ...days.map((d) => Math.max(d.visits, d.downloads)));
  const CH = 150, CW = 700, PAD = 6;
  const bw = days.length ? Math.min(34, (CW - PAD * 2) / days.length) : 0;

  return (
    <div className="ai-board">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: "var(--ink)" }}>App installs</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 14 }}>
            Traffic, downloads and live feedback from the public portal{" "}
            <code style={{ background: "var(--bg-deep)", padding: "1px 6px", borderRadius: 6 }}>/download-apk</code>
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
          <button onClick={exportCsv} style={csvBtn} disabled={!data.rows.length}>
            ⬇ Download CSV{data.rows.length ? ` (${data.rows.length})` : ""}
          </button>
        </div>
      </div>

      <div className="ai-grid">
        {/* ------- LEFT: data ------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
            {stat("Page visits", data.visits, undefined, "#1E5EFF")}
            {stat("Downloads", totalDl, `${totalReq} requested`, "var(--success)")}
            {stat("User app", dl["user"] ?? 0, `${req["user"] ?? 0} requested`, "var(--primary)")}
            {stat("Driver app", dl["driver"] ?? 0, `${req["driver"] ?? 0} requested`, "#0EA5A4")}
          </div>

          {/* daily activity chart */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>Daily activity (IST)</div>
              <div style={{ display: "flex", gap: 14, fontSize: 12, color: "var(--muted)" }}>
                <span><span style={dot("#1E5EFF")} /> Visits</span>
                <span><span style={dot("var(--success)")} /> Downloads</span>
              </div>
            </div>
            {days.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 14, padding: "18px 0" }}>No activity in this range yet.</div>
            ) : (
              <svg viewBox={`0 0 ${CW} ${CH + 26}`} style={{ width: "100%", height: "auto", display: "block" }}>
                {[0.25, 0.5, 0.75, 1].map((g) => (
                  <line key={g} x1={0} x2={CW} y1={CH - CH * g} y2={CH - CH * g} stroke="var(--border-soft)" strokeWidth={1} />
                ))}
                {days.map((d, i) => {
                  const x = PAD + i * ((CW - PAD * 2) / days.length) + ((CW - PAD * 2) / days.length - bw) / 2;
                  const hv = (d.visits / maxV) * (CH - 8);
                  const hd = (d.downloads / maxV) * (CH - 8);
                  return (
                    <g key={d.day}>
                      <rect x={x} y={CH - hv} width={bw * 0.42} height={Math.max(hv, d.visits ? 3 : 0)} rx={2.5} fill="#1E5EFF" opacity={0.85}>
                        <title>{`${fmtDay(d.day)}: ${d.visits} visits`}</title>
                      </rect>
                      <rect x={x + bw * 0.5} y={CH - hd} width={bw * 0.42} height={Math.max(hd, d.downloads ? 3 : 0)} rx={2.5} fill="#10B981">
                        <title>{`${fmtDay(d.day)}: ${d.downloads} downloads`}</title>
                      </rect>
                      {days.length <= 16 || i % Math.ceil(days.length / 12) === 0 ? (
                        <text x={x + bw / 2} y={CH + 17} textAnchor="middle" fontSize={10.5} fill="var(--muted)">
                          {fmtDay(d.day)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* funnel */}
          <div style={card}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>Downloads → signups funnel (matched by phone/email)</div>
            {data.funnel.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 14 }}>No downloads in this range.</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 26 }}>
                {data.funnel.map((f) => {
                  const pct = f.downloads ? Math.round((f.matched_signups / f.downloads) * 100) : 0;
                  return (
                    <div key={f.app} style={{ minWidth: 200, flex: "1 1 200px" }}>
                      <div style={{ fontWeight: 600, textTransform: "capitalize", color: "var(--ink)" }}>{f.app} app</div>
                      <div style={{ height: 8, background: "var(--bg-deep)", borderRadius: 99, margin: "8px 0 6px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: "linear-gradient(90deg, var(--success), #34d399)", transition: "width .6s ease" }} />
                      </div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>
                        {f.matched_signups} signed in / {f.downloads} downloaded
                        <strong style={{ color: "var(--success)", marginLeft: 6 }}>{pct}%</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* recent downloads */}
          <div style={card}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>Recent downloads (latest 100 in range)</div>
            {data.recent.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 14 }}>{loaded ? "No download requests in this range." : "Loading…"}</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                      <th style={th}>When</th><th style={th}>App</th><th style={th}>Contact</th><th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r, i) => (
                      <tr key={i}>
                        <td style={{ ...td, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                        <td style={{ ...td, textTransform: "capitalize" }}>{r.app}</td>
                        <td style={td}>{r.contact ?? "·"}</td>
                        <td style={td}>
                          <span style={{
                            fontSize: 12, padding: "2px 8px", borderRadius: 999,
                            background: r.status === "downloaded" ? "rgba(16,185,129,.12)" : "var(--bg-deep)",
                            color: r.status === "downloaded" ? "var(--success)" : "var(--muted)",
                          }}>{r.status === "downloaded" ? "downloaded" : "requested"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ------- RIGHT: live feedback rail ------- */}
        <aside style={{ minWidth: 0 }}>
          <div style={{ ...card, position: "sticky", top: 12, display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 40px)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="ai-live-dot" />
                <strong style={{ fontSize: 14, color: "var(--ink)", letterSpacing: ".02em" }}>LIVE FEEDBACK</strong>
              </div>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{updatedAt ? `updated ${updatedAt}` : "loading…"}</span>
            </div>
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
              {data.messages.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13.5, padding: "8px 0" }}>
                  {loaded ? "No messages in this range yet. New portal messages appear here automatically." : "Loading…"}
                </div>
              ) : (
                data.messages.map((m, i) => (
                  <div key={`${m.created_at}-${i}`} className="ai-msg" style={{
                    border: "1px solid var(--border-soft)", borderLeft: "3px solid var(--primary)",
                    borderRadius: 10, padding: "10px 12px", background: i === 0 ? "var(--primary-faint)" : "var(--surface)",
                  }}>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>
                      {fmt(m.created_at)} · {m.contact ?? "no contact left"}
                    </div>
                    <div style={{ fontSize: 13.5, color: "var(--ink)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.message}</div>
                  </div>
                ))
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
              Auto-refreshes every {POLL_MS / 1000}s · respects the date filter
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        .ai-grid { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 3fr); gap: 16px; align-items: start; }
        @media (max-width: 1100px) { .ai-grid { grid-template-columns: minmax(0, 1fr); } }
        .ai-live-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--danger); box-shadow: 0 0 0 0 rgba(220,38,38,.5); animation: aiBeat 1.6s infinite; display: inline-block; }
        @keyframes aiBeat { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,.45); } 70% { box-shadow: 0 0 0 8px rgba(220,38,38,0); } 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); } }
        .ai-msg { animation: aiIn .35s ease both; }
        @keyframes aiIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function dot(color: string): React.CSSProperties {
  return { display: "inline-block", width: 9, height: 9, borderRadius: 3, background: color, marginRight: 5, verticalAlign: "baseline" };
}
const th: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--border)" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" };
const csvBtn: React.CSSProperties = {
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--ink)",
  borderRadius: 10, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", boxShadow: "var(--shadow-sm)",
};
