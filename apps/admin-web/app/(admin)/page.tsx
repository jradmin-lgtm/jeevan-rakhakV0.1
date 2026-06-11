import React from "react";
import { LiveDashboard } from "./LiveDashboard";
import { InstallsFunnel } from "./InstallsFunnel";
import { adminFetch } from "../../lib/adminFetch";

// API_BASE stays in props for client components — they compute proxy
// paths from it. Server-side, adminFetch goes direct with the real key.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getDashboard() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/dashboard`);
    if (!res.ok) throw new Error("dashboard");
    return res.json();
  } catch {
    return { activeTrips: 0, onlineDrivers: 0, bookingsToday: 0, completedTotal: 0, avgResponseTimeMinutes: 0, openTickets: 0 };
  }
}

async function getRecentBookings() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/bookings`);
    if (!res.ok) throw new Error("bookings");
    const data = await res.json();
    return data.bookings ?? [];
  } catch {
    return [];
  }
}

async function getDrivers() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/drivers`);
    if (!res.ok) throw new Error("drivers");
    const data = await res.json();
    return data.drivers ?? [];
  } catch {
    return [];
  }
}

async function getAppEvents() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/app-events`);
    if (!res.ok) throw new Error("app-events");
    const d = await res.json();
    return { visits: d.visits ?? 0, downloads: d.downloads ?? [], requested: d.requested ?? [], funnel: d.funnel ?? [] };
  } catch {
    return { visits: 0, downloads: [], requested: [], funnel: [] };
  }
}

export default async function DashboardPage() {
  const [stats, bookings, drivers, installs] = await Promise.all([
    getDashboard(),
    getRecentBookings(),
    getDrivers(),
    getAppEvents()
  ]);
  return (
    <>
      <LiveDashboard initialStats={stats} initialBookings={bookings} initialDrivers={drivers} apiBase={API_BASE} />
      <InstallsFunnel initial={installs} />
    </>
  );
}
