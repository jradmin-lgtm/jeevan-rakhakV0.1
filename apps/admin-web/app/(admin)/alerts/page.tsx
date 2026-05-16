import React from "react";
import { adminFetch } from "../../../lib/adminFetch";
import { AlertsClient } from "./AlertsClient";

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

export default async function AlertsPage() {
  const [health, events] = await Promise.all([loadHealth(), loadEvents()]);
  return <AlertsClient initialHealth={health} initialEvents={events} apiBase={API_BASE} />;
}
