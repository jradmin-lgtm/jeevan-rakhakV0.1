import React from "react";
import { adminFetch } from "../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type Row = { app: string | null; n: number };
type FunnelRow = { app: string; downloads: number; matched_signups: number };
type Recent = { app: string; contact: string | null; status: string | null; created_at: string };
type Message = { contact: string | null; message: string; created_at: string };

async function getData() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/app-events`);
    if (!res.ok) throw new Error("app-events");
    return await res.json();
  } catch {
    return { visits: 0, downloads: [], requested: [], recent: [], funnel: [], messages: [] };
  }
}

function byApp(rows: Row[]): Record<string, number> {
  return Object.fromEntries((rows || []).map((r) => [r.app ?? "·", r.n]));
}
function fmt(ts: string): string {
  try {
    return new Date(ts).toLocaleString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
const card: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)",
  padding: "18px 20px", boxShadow: "var(--shadow-sm)",
};

export default async function AppInstallsPage() {
  const d = await getData();
  const dl = byApp(d.downloads);
  const req = byApp(d.requested);
  const funnel: FunnelRow[] = d.funnel ?? [];
  const recent: Recent[] = d.recent ?? [];
  const messages: Message[] = d.messages ?? [];
  const totalDl = (d.downloads || []).reduce((s: number, r: Row) => s + r.n, 0);
  const totalReq = (d.requested || []).reduce((s: number, r: Row) => s + r.n, 0);

  const stat = (label: string, value: React.ReactNode, hint?: string) => (
    <div style={card}>
      <div style={{ fontSize: 13, color: "var(--muted)", letterSpacing: ".02em" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: "var(--ink)", marginTop: 4 }}>{value}</div>
      {hint ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: "var(--ink)" }}>App installs</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 14 }}>
            Traffic + downloads from the public portal <code style={{ background: "var(--bg-deep)", padding: "1px 6px", borderRadius: 6 }}>/download-apk</code>
          </p>
        </div>
      </div>

      {/* top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
        {stat("Page visits", d.visits ?? 0)}
        {stat("Downloads (completed)", totalDl, `${totalReq} requested`)}
        {stat("User app", dl["user"] ?? 0, `${req["user"] ?? 0} requested`)}
        {stat("Driver app", dl["driver"] ?? 0, `${req["driver"] ?? 0} requested`)}
      </div>

      {/* funnel */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>Downloads → signups funnel (matched by phone/email)</div>
        {funnel.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>No downloads yet.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            {funnel.map((f) => {
              const pct = f.downloads ? Math.round((f.matched_signups / f.downloads) * 100) : 0;
              return (
                <div key={f.app} style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 600, textTransform: "capitalize", color: "var(--ink)" }}>{f.app} app</div>
                  <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
                    {f.matched_signups} signed in / {f.downloads} downloaded
                    <strong style={{ color: "var(--success)", marginLeft: 6 }}>{pct}%</strong>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* portal messages */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>Messages from the portal (latest 50)</div>
        {messages.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>No messages yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ borderBottom: "1px solid var(--border-soft)", paddingBottom: 10 }}>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                  {fmt(m.created_at)} · {m.contact ?? "no contact left"}
                </div>
                <div style={{ fontSize: 14, color: "var(--ink)", whiteSpace: "pre-wrap" }}>{m.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* recent log */}
      <div style={card}>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>Recent downloads (latest 100)</div>
        {recent.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 14 }}>No download requests yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>When</th>
                  <th style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>App</th>
                  <th style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Contact</th>
                  <th style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)", color: "var(--muted)", whiteSpace: "nowrap" }}>{fmt(r.created_at)}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)", textTransform: "capitalize" }}>{r.app}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" }}>{r.contact ?? "·"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-soft)" }}>
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
  );
}
