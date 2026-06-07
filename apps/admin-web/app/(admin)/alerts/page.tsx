import React from "react";
import { adminFetch } from "../../../lib/adminFetch";
import { AlertsHubClient } from "./AlertsHubClient";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

async function loadHealth(): Promise<Health | null> {
  try {
    const r = await adminFetch(`${API_BASE}/api/v1/admin/health`);
    if (!r.ok) return null;
    return (await r.json()) as Health;
  } catch {
    return null;
  }
}

async function loadEvents(): Promise<SystemEvent[]> {
  try {
    const r = await adminFetch(`${API_BASE}/api/v1/admin/events?limit=200`);
    if (!r.ok) return [];
    const { events } = (await r.json()) as { events: SystemEvent[] };
    return events ?? [];
  } catch {
    return [];
  }
}

// Seed the safety section with the live (active) set so the operator lands on
// live duress alerts first; the client then live-polls every 10s.
async function loadSafety(): Promise<unknown[]> {
  try {
    const r = await adminFetch(`${API_BASE}/api/v1/admin/safety?status=active`);
    if (!r.ok) return [];
    const data = await r.json();
    return data.alerts ?? [];
  } catch {
    return [];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function AlertsPage({ searchParams }: any) {
  const sp = searchParams ? await searchParams : {};
  // Default to the Emergency Safety Alerts banner (the high-priority surface);
  // ?tab=system opens the System Alerts section instead (used by deep links).
  const initialTab = sp?.tab === "system" ? "system" : "safety";
  const [health, events, safety] = await Promise.all([loadHealth(), loadEvents(), loadSafety()]);
  return (
    <AlertsHubClient
      initialHealth={health}
      initialEvents={events}
      initialSafety={safety}
      apiBase={API_BASE}
      initialTab={initialTab}
    />
  );
}
