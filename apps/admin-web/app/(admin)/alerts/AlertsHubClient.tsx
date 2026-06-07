"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../../lib/adminFetch";
import { AlertsClient } from "./AlertsClient";
import { SafetyAlertsClient } from "../safety-alerts/SafetyAlertsClient";

// Merged Alerts hub. Replaces the two separate sidebar entries (Alerts +
// Safety Alerts) with ONE "Alerts" section that carries two big banner toggles:
//   1. Emergency Safety Alerts  (the live duress/panic surface, high priority)
//   2. System Alerts            (service health + the event log)
// Picking a banner swaps the detailed section below it. The banners always show
// their live summary numbers (active safety count; API/DB status + error
// counts) so the operator sees both at a glance without two nav rows.

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

type Tab = "safety" | "system";

const API_POLL_MS = 8000;

export function AlertsHubClient({
  initialHealth,
  initialEvents,
  initialSafety,
  apiBase,
  initialTab
}: {
  initialHealth: Health | null;
  initialEvents: SystemEvent[];
  // Pass-through to SafetyAlertsClient (snake_case rows off GET /admin/safety).
  initialSafety: unknown[];
  apiBase: string;
  initialTab: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [health, setHealth] = useState<Health | null>(initialHealth);
  const [safetyActive, setSafetyActive] = useState<number>(
    (initialSafety as { status?: string }[] | undefined ?? []).filter(
      (a) => (a.status ?? "").toUpperCase() === "ACTIVE"
    ).length
  );

  // Poll the two banner summary numbers (the detailed sections do their own
  // deeper polling when mounted). Keep-last-good on any transient blip so the
  // banners never flicker to zero on a cold-start tick.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [sRes, hRes] = await Promise.all([
          adminFetch(`${apiBase}/api/v1/admin/safety/count`),
          adminFetch(`${apiBase}/api/v1/admin/health`)
        ]);
        if (sRes.ok) {
          const d = await sRes.json();
          if (alive) setSafetyActive(Number(d?.active ?? 0));
        }
        if (hRes.ok) {
          const h = (await hRes.json()) as Health;
          if (alive) setHealth(h);
        }
      } catch {
        /* keep last good */
      }
    };
    void tick();
    const id = setInterval(tick, API_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase]);

  const apiUp = health?.api.status === "up";
  const dbUp = health?.db.status === "up";
  const crit = health?.events.critical24h ?? 0;
  const err = health?.events.error24h ?? 0;
  const systemTrouble = !apiUp || !dbUp || crit > 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p>Emergency safety alerts and system health, in one place. Pick a section below.</p>
        </div>
      </div>

      <div className="alerts-hub-banners">
        <button
          type="button"
          onClick={() => setTab("safety")}
          className={`hub-banner safety ${tab === "safety" ? "sel" : ""}`}
        >
          <div className="hb-icon" aria-hidden="true">🆘</div>
          <div className="hb-body">
            <div className="hb-title">Emergency Safety Alerts</div>
            <div className="hb-sub">Duress alerts raised from an active ride</div>
          </div>
          <div className="hb-metric">
            <div className="hb-num" style={{ color: safetyActive > 0 ? "#DC2626" : undefined }}>
              {safetyActive}
            </div>
            <div className="hb-num-label">active</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setTab("system")}
          className={`hub-banner system ${tab === "system" ? "sel" : ""}`}
        >
          <div className="hb-icon" aria-hidden="true">{systemTrouble ? "⚠️" : "🟢"}</div>
          <div className="hb-body">
            <div className="hb-title">System Alerts</div>
            <div className="hb-sub">Service health and the event log</div>
          </div>
          <div className="hb-metric">
            <div className="hb-statusline">
              <span className={`dot ${apiUp ? "ok" : "bad"}`} />API
              <span className={`dot ${dbUp ? "ok" : "bad"}`} style={{ marginLeft: 12 }} />DB
            </div>
            <div className="hb-num-label">
              {crit > 0 ? `${crit} critical, ${err} errors (24h)` : `${err} errors (24h)`}
            </div>
          </div>
        </button>
      </div>

      <div style={{ marginTop: 22 }}>
        {tab === "safety" ? (
          <SafetyAlertsClient initialAlerts={initialSafety as never} apiBase={apiBase} embedded />
        ) : (
          <AlertsClient
            initialHealth={initialHealth}
            initialEvents={initialEvents}
            apiBase={apiBase}
            embedded
          />
        )}
      </div>

      <style>{`
        .alerts-hub-banners {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 760px) {
          .alerts-hub-banners { grid-template-columns: 1fr; }
        }
        .hub-banner {
          display: flex;
          align-items: center;
          gap: 14px;
          text-align: left;
          width: 100%;
          padding: 18px 20px;
          border-radius: 14px;
          cursor: pointer;
          border: 1px solid var(--border, #E2E8F0);
          background: var(--surface, #fff);
          transition: border-color .15s, box-shadow .15s;
        }
        .hub-banner:hover { box-shadow: 0 2px 12px rgba(15,23,42,0.07); }
        .hub-banner.safety.sel {
          border-color: #DC2626;
          background: rgba(220,38,38,0.05);
          box-shadow: 0 0 0 1px #DC2626 inset;
        }
        .hub-banner.system.sel {
          border-color: #0F172A;
          background: rgba(15,23,42,0.04);
          box-shadow: 0 0 0 1px #0F172A inset;
        }
        .hb-icon { font-size: 28px; line-height: 1; }
        .hb-body { flex: 1; min-width: 0; }
        .hb-title { font-size: 16px; font-weight: 700; color: var(--ink, #0F172A); }
        .hb-sub { font-size: 12.5px; color: var(--muted, #64748B); margin-top: 2px; }
        .hb-metric { text-align: right; white-space: nowrap; }
        .hb-num { font-size: 30px; font-weight: 800; line-height: 1; color: var(--ink, #0F172A); }
        .hb-num-label {
          font-size: 11px;
          color: var(--muted, #64748B);
          text-transform: uppercase;
          letter-spacing: .04em;
          margin-top: 4px;
        }
        .hb-statusline { font-size: 13px; font-weight: 700; color: var(--ink, #0F172A); }
        .hb-statusline .dot {
          width: 9px; height: 9px; border-radius: 50%;
          display: inline-block; margin-right: 5px;
        }
        .hb-statusline .dot.ok { background: #10B981; }
        .hb-statusline .dot.bad { background: #DC2626; }
      `}</style>
    </>
  );
}
