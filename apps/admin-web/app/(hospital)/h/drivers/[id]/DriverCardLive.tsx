"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatIST, formatTimeIST } from "../../../../../lib/dates";
import { prettyStatus, prettyEmergency } from "../../../../../lib/status";
import { useHospitalSocket } from "../../../HospitalSocketProvider";
import { RaiseTicketForm } from "../../../RaiseTicketForm";

/**
 * Hospital portal driver card (v1.2.1, CR#3) — READ-ONLY, hospital-scoped.
 *
 * Fetches /hospital/drivers/<id> through /api/hospital-proxy (hospital JWT
 * only, never the admin key). The endpoint:
 *   - 404s if the driver isn't associated with the caller's hospital (tagged or
 *     ≥1 ride destined here) → we show "Driver not associated with your hospital."
 *   - returns ONLY this-hospital stats/rides (dest_hospital_id = hid), never the
 *     driver's activity at other clients.
 *   - returns NO KYC docs / phone / email — just name, vehicle, status, rating,
 *     kycVerified (read-only badge). No KYC enable/disable here (admin-only).
 *
 * Live like the admin driver page: a 10s poll + a refetch on the
 * `hospital:booking_update` socket event (a booking update can flip the driver
 * to ON_TRIP / free them, and changes the ride list). Both the interval and the
 * socket subscription are cleared on unmount (timer-leak rule).
 *
 * Every ride shows the locked human `#displayId` (never the raw UUID); the UUID
 * stays the routing key only (row → /h/<rideId> ride card).
 */

type DriverProfile = {
  id: string;
  name?: string | null;
  vehicleNumber?: string | null;
  status: string;
  rating?: number | null;
  lastLat?: number | null;
  lastLng?: number | null;
  kycVerified?: boolean | null;
};

type DriverStats = { total: number; completed: number; active: number; cancelled: number };

// Rides come straight from pgClient on the server → snake_case columns.
type RideRow = {
  id: string;
  display_id?: string | null;
  status: string;
  is_sos?: boolean;
  emergency_type: string;
  patient_name?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  created_at?: string | null;
  accepted_at?: string | null;
  arrived_at?: string | null;
  picked_up_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  hospital_ack_at?: string | null;
};

type DriverCard = { driver: DriverProfile; stats: DriverStats; rides: RideRow[] };

const POLL_MS = 10000;

// Live availability chip — mirrors the hospital driver-monitor list so the
// status reads identically across the portal.
const STATUS_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  AVAILABLE: { label: "Online", bg: "rgba(16,185,129,0.12)", fg: "#065F46" },
  ON_TRIP: { label: "On trip", bg: "rgba(6,182,212,0.14)", fg: "#0E7490" },
  OFFLINE: { label: "Offline", bg: "rgba(148,163,184,0.18)", fg: "#475569" }
};

function patientLine(r: RideRow): string {
  return (
    [
      r.patient_name,
      r.patient_age ? `${r.patient_age}y` : null,
      r.patient_gender === "M" ? "Male" : r.patient_gender === "F" ? "Female" : r.patient_gender === "O" ? "Other" : null
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

function rowTime(r: RideRow): string {
  const t = r.completed_at ?? r.cancelled_at ?? r.created_at;
  return t ? formatIST(t) : "—";
}

export function DriverCardLive({ driverId }: { driverId: string }) {
  const [data, setData] = useState<DriverCard | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [showTicket, setShowTicket] = useState(false);
  const { subscribe } = useHospitalSocket();
  const router = useRouter();
  const aliveRef = useRef(true);

  const fetchCard = useCallback(async () => {
    try {
      const res = await fetch(`/api/hospital-proxy/api/v1/hospital/drivers/${driverId}`, { cache: "no-store" });
      if (res.status === 404) {
        if (aliveRef.current) setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const json: DriverCard = await res.json();
      if (!aliveRef.current) return;
      setData(json);
      setUpdatedAt(Date.now());
    } catch {
      /* keep last good */
    }
  }, [driverId]);

  useEffect(() => {
    aliveRef.current = true;
    void fetchCard();
    const id = setInterval(fetchCard, POLL_MS);
    // A booking update can flip this driver ON_TRIP / free them and changes the
    // ride list — refetch live, same channel the monitor list listens on.
    const unsub = subscribe("hospital:booking_update", () => {
      void fetchCard();
    });
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      unsub();
    };
  }, [fetchCard, subscribe]);

  if (notFound) {
    return <div className="card muted">Driver not associated with your hospital.</div>;
  }
  if (!data) {
    return <div className="card muted">Loading driver…</div>;
  }

  const d = data.driver;
  const s = data.stats;
  const chip = STATUS_CHIP[d.status] ?? { label: d.status, bg: "rgba(148,163,184,0.18)", fg: "#475569" };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Header — name, vehicle, live status, rating, verified badge (read-only). */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{d.name ?? "Unnamed driver"}</span>
          <span className="muted" style={{ fontSize: 13 }}>· {d.vehicleNumber ?? "No vehicle #"}</span>
          <span style={{ background: chip.bg, color: chip.fg, fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 999 }}>{chip.label}</span>
          <span className="muted" style={{ fontSize: 13 }}>⭐ {(d.rating ?? 5).toFixed(1)}</span>
          {d.kycVerified ? (
            <span style={{ background: "rgba(16,185,129,0.12)", color: "var(--success)", fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 999 }}>✓ Verified</span>
          ) : (
            <span style={{ background: "rgba(245,158,11,0.14)", color: "#B45309", fontWeight: 700, fontSize: 11, padding: "3px 10px", borderRadius: 999 }}>KYC pending</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
            Live · {formatTimeIST(updatedAt)}
          </span>
          <button
            type="button"
            onClick={() => setShowTicket((v) => !v)}
            style={{ background: "transparent", color: "var(--danger)", border: "1px solid var(--danger)", padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
          >
            {showTicket ? "Close" : "Raise concern"}
          </button>
        </div>
      </div>

      {/* Contextual ticket form — pre-filled DRIVER + driverId, subject locked. */}
      {showTicket ? (
        <RaiseTicketForm
          subjectType="DRIVER"
          driverId={driverId}
          contextLabel={`Driver: ${d.name ?? d.vehicleNumber ?? driverId.slice(0, 8)}`}
          lockSubject
          onDone={() => setShowTicket(false)}
        />
      ) : null}

      {/* Stats — rides to THIS hospital only. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <Kpi label="Total rides" value={s.total} />
        <Kpi label="Completed" value={s.completed} tone="var(--success)" />
        <Kpi label="Active" value={s.active} tone="#0E7490" />
        <Kpi label="Cancelled" value={s.cancelled} tone="#475569" />
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "-8px 2px 0" }}>
        Stats and rides below cover only this driver's ambulances destined to your hospital.
      </p>

      {/* Rides to THIS hospital — all statuses, newest first. Row → /h/<id>. */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Rides to your hospital · {data.rides.length}</h3>
        </div>
        {data.rides.length === 0 ? (
          <div className="muted">No rides from this driver to your hospital yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" }}>
                  <th style={{ padding: "8px 8px 8px 0" }}>Ride ID</th>
                  <th style={{ padding: 8 }}>Patient</th>
                  <th style={{ padding: 8 }}>Emergency</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.rides.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/h/${r.id}`)}
                    style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                  >
                    <td style={{ padding: "10px 8px 10px 0", fontFamily: "var(--mono, monospace)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {r.is_sos ? <span title="SOS emergency" style={{ marginRight: 4 }}>🚨</span> : null}
                      #{r.display_id ?? r.id.slice(0, 8)}
                    </td>
                    <td style={{ padding: 10 }}>{patientLine(r)}</td>
                    <td style={{ padding: 10 }}>{prettyEmergency(r.emergency_type)}</td>
                    <td style={{ padding: 10 }}>
                      <span className={`pill ${r.status.toLowerCase()}`}>{prettyStatus(r.status)}</span>
                    </td>
                    <td style={{ padding: 10, whiteSpace: "nowrap" }} className="muted">{rowTime(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card" style={{ textAlign: "left" }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, color: tone ?? "var(--ink)" }}>{value}</div>
    </div>
  );
}
