import React from "react";
import { LiveDashboard } from "./LiveDashboard";
import { InstallsFunnel } from "./InstallsFunnel";
import { adminFetch } from "../../lib/adminFetch";

// API_BASE stays in props for client components — they compute proxy
// paths from it. Server-side, adminFetch goes direct with the real key.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export const dynamic = "force-dynamic";

async function getDashboard() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/dashboard`);
    if (!res.ok) throw new Error("dashboard");
    return res.json();
  } catch (error) { console.error("Dashboard load failed", error); return null; }
}

async function getRecentBookings() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/bookings`);
    if (!res.ok) throw new Error("bookings");
    const data = await res.json();
    return data.bookings ?? [];
  } catch (error) { console.error("Dashboard data load failed", error); return null; }
}

async function getDrivers() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/drivers?limit=6`);
    if (!res.ok) throw new Error("drivers");
    const data = await res.json();
    return data.drivers ?? [];
  } catch (error) { console.error("Dashboard data load failed", error); return null; }
}

async function getAppEvents() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/app-events`);
    if (!res.ok) throw new Error("app-events");
    const d = await res.json();
    return { visits: d.visits ?? 0, downloads: d.downloads ?? [], requested: d.requested ?? [], funnel: d.funnel ?? [] };
  } catch (error) { console.error("Install metrics load failed", error); return null; }
}

export default async function DashboardPage() {
  const [stats, bookings, drivers, installs] = await Promise.all([
    getDashboard(),
    getRecentBookings(),
    getDrivers(),
    getAppEvents()
  ]);
  if (!stats || !bookings || !drivers || !installs) return <section role="alert"><h2>Dashboard data could not be loaded</h2><p>Check the connection and retry. Counts are unavailable.</p><a href="/">Retry dashboard</a></section>;
  return (
    <>
      <LiveDashboard initialStats={stats} initialBookings={bookings} initialDrivers={drivers} apiBase={API_BASE} />
      <InstallsFunnel initial={installs} />
    </>
  );
}
