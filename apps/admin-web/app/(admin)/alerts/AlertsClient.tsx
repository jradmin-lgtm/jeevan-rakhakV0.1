"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../../lib/adminFetch";

type Health = {
  api: { status: "up" | "down"; uptimeSec: number };
  db: { status: "up" | "down"; latencyMs: number | null; error?: string };
  events: { critical24h: number; error24h: number; warn24h: number };
  checkedAt: string;
};

type SystemEvent = {
  id: string;
  ts: string;
  level: "info" | "warn" | "error" | "critical";
  source: string;
  message: string;
  context: unknown;
  notified: boolean;
};

type Props = {
  initialHealth: Health | null;
  initialEvents: SystemEvent[];
  apiBase: string;
};

const LEVELS = ["all", "critical", "error", "warn", "info"] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_COLOR: Record<SystemEvent["level"], string> = {
  critical: "#7C1D1D",
  error: "#DC2626",
  warn: "#F59E0B",
  info: "#0EA5E9"
};

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`;
}

function relative(ts: string, now: number): string {
  const diff = Math.max(0, Math.floor((now - new Date(ts).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleString();
}

export function AlertsClient({ initialHealth, initialEvents, apiBase }: Props) {
  const [health, setHealth] = useState<Health | null>(initialHealth);
  const [events, setEvents] = useState<SystemEvent[]>(initialEvents);
  const [level, setLevel] = useState<Level>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const levelQ = level === "all" ? "" : `&level=${level}`;
      const [hRes, eRes] = await Promise.all([
        adminFetch(`${apiBase}/api/v1/admin/health`),
        adminFetch(`${apiBase}/api/v1/admin/events?limit=200${levelQ}`)
      ]);
      if (hRes.ok) setHealth((await hRes.json()) as Health);
      if (eRes.ok) {
        const data = (await eRes.json()) as { events: SystemEvent[] };
        setEvents(data.events ?? []);
      }
      setLastRefresh(Date.now());
    } catch {
      /* keep last good state */
    } finally {
      setRefreshing(false);
    }
  }, [apiBase, level]);

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Refresh immediately when the level filter changes
  useEffect(() => {
    void refresh();
  }, [level, refresh]);

  // Tick every second so "X s ago" stays live
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const apiUp = health?.api.status === "up";
  const dbUp = health?.db.status === "up";

  return (
    <div className="content">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1>Alerts</h1>
          <p className="meta">
            Live service health and event stream · refreshes every 30s · last refresh {relative(new Date(lastRefresh).toISOString(), now)}
          </p>
        </div>
        <button onClick={() => void refresh()} disabled={refreshing} className="btn-secondary">
          {refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {/* Health pills */}
      <div className="health-grid">
        <HealthCard
          label="API server"
          ok={apiUp}
          detail={
            health ? `Uptime ${formatUptime(health.api.uptimeSec)}` : "Loading…"
          }
        />
        <HealthCard
          label="Database (Neon)"
          ok={dbUp}
          detail={
            health
              ? dbUp
                ? `${health.db.latencyMs ?? "?"}ms · healthy`
                : health.db.error ?? "down"
              : "Loading…"
          }
        />
        <CountCard
          label="Critical events · 24h"
          count={health?.events.critical24h ?? 0}
          color="#7C1D1D"
        />
        <CountCard
          label="Errors · 24h"
          count={health?.events.error24h ?? 0}
          color="#DC2626"
        />
        <CountCard
          label="Warnings · 24h"
          count={health?.events.warn24h ?? 0}
          color="#F59E0B"
        />
      </div>

      {/* Level filter */}
      <div style={{ display: "flex", gap: 8, margin: "20px 0 12px" }}>
        {LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={l === level ? "filter-pill filter-pill-active" : "filter-pill"}
          >
            {l === "all" ? "All" : l.charAt(0).toUpperCase() + l.slice(1)}
          </button>
        ))}
      </div>

      {/* Events table */}
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Recent events ({events.length})</h2>
        {events.length === 0 ? (
          <p className="meta">No events recorded yet. New ones appear here as the API logs them.</p>
        ) : (
          <table className="events-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Level</th>
                <th>Source</th>
                <th>Message</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="meta nowrap">{relative(e.ts, now)}</td>
                  <td>
                    <span
                      className="level-pill"
                      style={{ background: `${LEVEL_COLOR[e.level]}1a`, color: LEVEL_COLOR[e.level] }}
                    >
                      {e.level}
                    </span>
                  </td>
                  <td className="nowrap">{e.source}</td>
                  <td>{e.message}</td>
                  <td className="meta">{e.notified ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .content { padding: 24px 32px 80px; }
        h1 { font-size: 26px; margin: 0; color: var(--ink); }
        h2 { font-size: 16px; margin: 0 0 12px; color: var(--ink); }
        .meta { color: var(--muted); font-size: 13px; }
        .nowrap { white-space: nowrap; }
        .health-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
          margin-top: 12px;
        }
        .health-card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 10px;
          padding: 14px;
        }
        .health-card .dot {
          width: 10px; height: 10px; border-radius: 50%;
          display: inline-block; margin-right: 8px;
        }
        .health-card .ok { background: #10B981; }
        .health-card .bad { background: #DC2626; }
        .count-card-num { font-size: 28px; font-weight: 700; margin-top: 4px; }
        .card {
          background: var(--surface, #fff);
          border: 1px solid var(--border, #E2E8F0);
          border-radius: 10px;
          padding: 18px;
        }
        .filter-pill {
          background: transparent;
          border: 1px solid var(--border, #E2E8F0);
          color: var(--muted, #64748B);
          padding: 6px 14px;
          border-radius: 999px;
          font-size: 13px;
          cursor: pointer;
        }
        .filter-pill-active {
          background: #0F172A;
          color: #fff;
          border-color: #0F172A;
        }
        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border, #E2E8F0);
          color: var(--ink, #0F172A);
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-secondary:disabled { opacity: 0.6; cursor: wait; }
        .events-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .events-table th {
          text-align: left;
          padding: 8px 10px;
          font-size: 11px;
          color: var(--muted, #64748B);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid var(--border, #E2E8F0);
        }
        .events-table td {
          padding: 10px;
          border-bottom: 1px solid #F1F5F9;
          vertical-align: top;
        }
        .events-table tr:hover td { background: #F8FAFC; }
        .level-pill {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  );
}

function HealthCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="health-card">
      <div className="meta" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
        <span className={`dot ${ok ? "ok" : "bad"}`} />
        {ok ? "Up" : "Down"}
      </div>
      <div className="meta" style={{ marginTop: 4 }}>{detail}</div>
    </div>
  );
}

function CountCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="health-card">
      <div className="meta" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </div>
      <div className="count-card-num" style={{ color }}>{count}</div>
    </div>
  );
}
