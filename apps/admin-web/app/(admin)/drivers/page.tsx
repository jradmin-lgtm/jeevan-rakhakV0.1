import React from "react";
import { DriversList } from "./DriversList";
import { adminFetch } from "../../../lib/adminFetch";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function getDrivers() {
  try {
    const res = await adminFetch(`${API_BASE}/api/v1/admin/drivers?limit=100`);
    if (!res.ok) throw new Error("drivers");
    const data = await res.json();
    return { drivers: data.drivers, error: "" };
  } catch (error) {
    console.error("Driver list load failed", error);
    return { drivers: [], error: "Driver records could not be loaded. Retrying automatically." };
  }
}

export default async function DriversPage() {
  const { drivers, error } = await getDrivers();
  return <DriversList initialDrivers={drivers} initialError={error} apiBase={API_BASE} />;
}
