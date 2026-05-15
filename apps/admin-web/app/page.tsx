import React from "react";
import { LiveDashboard } from "./LiveDashboard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "dev-admin-key-change-in-prod";

const adminHeaders = { "x-admin-key": ADMIN_KEY };

async function getDashboard() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/dashboard`, { cache: "no-store", headers: adminHeaders });
    if (!res.ok) throw new Error("dashboard");
    return res.json();
  } catch {
    return { activeTrips: 0, onlineDrivers: 0, bookingsToday: 0, completedTotal: 0, avgResponseTimeMinutes: 0 };
  }
}

async function getRecentBookings() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/bookings`, { cache: "no-store", headers: adminHeaders });
    if (!res.ok) throw new Error("bookings");
    const data = await res.json();
    return data.bookings ?? [];
  } catch {
    return [];
  }
}

async function getDrivers() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/drivers`, { cache: "no-store", headers: adminHeaders });
    if (!res.ok) throw new Error("drivers");
    const data = await res.json();
    return data.drivers ?? [];
  } catch {
    return [];
  }
}

export default async function DashboardPage() {
  const [stats, bookings, drivers] = await Promise.all([
    getDashboard(),
    getRecentBookings(),
    getDrivers()
  ]);
  return <LiveDashboard initialStats={stats} initialBookings={bookings} initialDrivers={drivers} apiBase={API_BASE} />;
}
