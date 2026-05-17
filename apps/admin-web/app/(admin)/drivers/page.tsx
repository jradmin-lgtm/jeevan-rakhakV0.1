import React from "react";
import { DriversList } from "./DriversList";
import { adminFetch } from "../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

export default async function DriversPage() {
  const drivers = await getDrivers();
  return <DriversList initialDrivers={drivers} apiBase={API_BASE} />;
}
