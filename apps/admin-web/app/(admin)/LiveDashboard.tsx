"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";
import { formatTimeIST, formatTimeShortIST } from "../../lib/dates";
import { TrendsCard } from "./TrendsCard";

type Stats = {
  activeTrips: number;
  onlineDrivers: number;
  bookingsToday: number;
  completedTotal: number;
  avgResponseTimeMinutes: number;
};

type Booking = {
  id: string;
  emergencyType: string;
  status: string;
  pickupAddress?: string | null;
  dropAddress?: string | null;
  fareEstimateInr?: number | null;
  fareFinalInr?: number | null;
  createdAt: string;
  isDemo?: boolean;
};

type Driver = {
  id: string;
  phone: string;
  name?: string | null;
  vehicleNumber?: string | null;
  status: string;
  rating: number;
  lastSeenAt?: string | null;
  isDemo?: boolean;
};

const REFRESH_MS = 5000;

export function LiveDashboard({
  initialStats,
  initialBookings,
  initialDrivers,
  apiBase
}: {
  initialStats: Stats;
  initialBookings: Booking[];
  initialDrivers: Driver[];
  apiBase: string;
}) {
  const [stats, setStats] = useState<Stats>(initialStats);
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  // Initialized empty so SSR + first client render match (avoids hydration
  // mismatch on locale-formatted time). useEffect below sets it after mount.
  const [updatedAt, setUpdatedAt] = useState<string>("");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [s, b, d] = await Promise.all([
          adminFetch(`${apiBase}/api/v1/admin/dashboard`).then((r) => r.json()),
          adminFetch(`${apiBase}/api/v1/admin/bookings`).then((r) => r.json()),
          adminFetch(`${apiBase}/api/v1/admin/drivers`).then((r) => r.json())
        ]);
        if (!alive) return;
        setStats(s);
        setBookings(b.bookings ?? []);
        setDrivers(d.drivers ?? []);
        setUpdatedAt(formatTimeIST(new Date()));
      } catch {
        /* keep last good */
      }
    };
    void tick();
    const id = setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Live operations</h1>
          <p>Auto-refreshing every 5 seconds{updatedAt ? ` · last updated ${updatedAt}` : ""}</p>
        </div>
        <div className="muted" style={{ fontSize: 11 }}>API: {apiBase}</div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <p>Active trips</p>
          <h2>{stats.activeTrips}</h2>
        </div>
        <div className="kpi">
          <p>Online drivers</p>
          <h2>{stats.onlineDrivers}</h2>
        </div>
        <div className="kpi">
          <p>Bookings today</p>
          <h2>{stats.bookingsToday}</h2>
        </div>
        <div className="kpi">
          <p>Avg response (min)</p>
          <h2>{stats.avgResponseTimeMinutes.toFixed(1)}</h2>
        </div>
      </div>

      <div className="row">
        <div className="card">
          <div className="flex between center">
            <h3 style={{ margin: 0 }}>Recent bookings</h3>
            <a href="/bookings" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>View all →</a>
          </div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Emergency</th>
                  <th>Pickup → Drop</th>
                  <th>Fare</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: 16, textAlign: "center" }}>
                      No bookings in this view. Switch the source filter or create one from the user app.
                    </td>
                  </tr>
                ) : (
                  bookings.slice(0, 8).map((b) => (
                    <tr key={b.id}>
                      <td className="mono muted" suppressHydrationWarning>{formatTimeShortIST(b.createdAt)}</td>
                      <td>{prettyEmergency(b.emergencyType)}</td>
                      <td>
                        <div>{b.pickupAddress ?? "—"}</div>
                        {b.dropAddress ? <div className="muted" style={{ fontSize: 12 }}>→ {b.dropAddress}</div> : null}
                      </td>
                      <td className="mono">₹{b.fareFinalInr ?? b.fareEstimateInr ?? "—"}</td>
                      <td>
                        <span className={`pill ${b.status.toLowerCase()}`}>{prettyStatus(b.status)}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="flex between center">
            <h3 style={{ margin: 0 }}>Drivers</h3>
            <a href="/drivers" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>View all →</a>
          </div>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            {drivers.length === 0 ? (
              <div className="muted">No drivers in this view.</div>
            ) : (
              drivers.slice(0, 6).map((d) => (
                <div
                  key={d.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <div className="flex center gap-sm">
                      <span className={`dot ${d.status === "OFFLINE" ? "down" : "up"}`} />
                      <strong>{d.name ?? "Driver"}</strong>
                      <span className="muted" style={{ fontSize: 12 }}>{d.phone}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {d.vehicleNumber ?? "Vehicle pending"} · ⭐ {d.rating?.toFixed(1) ?? "5.0"}
                    </div>
                  </div>
                  <span className={`pill ${d.status.toLowerCase() === "on_trip" ? "accepted" : d.status === "AVAILABLE" ? "completed" : "cancelled"}`}>
                    {d.status === "ON_TRIP" ? "On trip" : d.status === "AVAILABLE" ? "Available" : "Offline"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Analytics + trends — date-filtered, polled every 30s. */}
      <TrendsCard apiBase={apiBase} />
    </>
  );
}

function prettyEmergency(t: string): string {
  switch (t) {
    case "ACCIDENT_TRAUMA": return "Accident / Trauma";
    case "CARDIAC": return "Cardiac";
    case "BREATHING_DISTRESS": return "Breathing distress";
    case "PREGNANCY_NEONATAL": return "Pregnancy / Neonatal";
    case "GENERAL_CRITICAL_TRANSFER": return "Critical transfer";
    default: return t;
  }
}

function prettyStatus(s: string): string {
  switch (s) {
    case "REQUESTED": return "Searching";
    case "ACCEPTED": return "Driver assigned";
    case "ARRIVED": return "Driver arrived";
    case "PICKED_UP": return "On trip";
    case "COMPLETED": return "Completed";
    case "CANCELLED": return "Cancelled";
    case "TIMED_OUT": return "No driver";
    default: return s;
  }
}
