"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatTimeIST, relativeIST } from "../../../lib/dates";
import { haversineKm, haversineEtaMin, fmtDistance, fmtEta } from "../../../lib/hospitalEta";
import { useHospitalSocket } from "../HospitalSocketProvider";

type HBooking = {
  id: string;
  display_id?: string | null;
  status: string;
  is_sos: boolean;
  emergency_type: string;
  patient_name?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_address?: string | null;
  drop_lat?: number | null;
  drop_lng?: number | null;
  accepted_at?: string | null;
  arrived_at?: string | null;
  picked_up_at?: string | null;
  hospital_ack_at?: string | null;
  has_assessment?: boolean;
  driver_name?: string | null;
  driver_id?: string | null;
  ambulance_number?: string | null;
  paramedic_name?: string | null;
  last_lat?: number | null;
  last_lng?: number | null;
};

const POLL_MS = 10000;

// The 8-step ambulance→hospital workflow indicator (CR#3). Steps:
// 1 Request Created → 2 Ambulance Assigned → 3 Arrived at pickup →
// 4 Picked Up → 5 Assessment In Progress → 6 Assessment Submitted →
// 7 En Route → 8 Arrived at Hospital.
export const WORKFLOW_STEPS = [
  "Request created",
  "Ambulance assigned",
  "Arrived at pickup",
  "Picked up",
  "Assessment in progress",
  "Assessment submitted",
  "En route to hospital",
  "Arrived at hospital"
];

export function workflowStep(b: { status: string; has_assessment?: boolean; hospital_ack_at?: string | null }): number {
  if (b.status === "ACCEPTED") return 2;
  if (b.status === "ARRIVED") return 3;
  if (b.status === "PICKED_UP") return b.has_assessment ? 6 : 5;
  if (b.status === "COMPLETED") return 8;
  return 1;
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
    case "ACCEPTED": return "Ambulance assigned";
    case "ARRIVED": return "At pickup";
    case "PICKED_UP": return "En route";
    case "COMPLETED": return "Arrived";
    default: return s;
  }
}

export function HospitalDashboardLive() {
  const [bookings, setBookings] = useState<HBooking[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [loaded, setLoaded] = useState(false);
  const { subscribe } = useHospitalSocket();
  const aliveRef = useRef(true);

  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital-proxy/api/v1/hospital/bookings", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (!aliveRef.current) return;
      setBookings(Array.isArray(json.bookings) ? json.bookings : []);
      setUpdatedAt(Date.now());
      setLoaded(true);
    } catch {
      /* keep last good */
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void fetchBookings();
    const id = setInterval(fetchBookings, POLL_MS);
    // Live: refetch the moment a ride destined here changes.
    const unsub = subscribe("hospital:booking_update", () => {
      void fetchBookings();
    });
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      unsub();
    };
  }, [fetchBookings, subscribe]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <span className="muted" style={{ fontSize: 12 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
          Live · refreshed {formatTimeIST(updatedAt)}
        </span>
      </div>

      {!loaded ? (
        <div className="card muted">Loading incoming queue…</div>
      ) : bookings.length === 0 ? (
        <div className="card muted">No incoming ambulances right now. New rides destined to your hospital appear here automatically.</div>
      ) : (
        bookings.map((b) => <BookingCard key={b.id} b={b} onAck={fetchBookings} />)
      )}
    </div>
  );
}

function BookingCard({ b, onAck }: { b: HBooking; onAck: () => void }) {
  const [acking, setAcking] = useState(false);
  const acked = !!b.hospital_ack_at;
  const step = workflowStep(b);

  // ETA/distance: ambulance (last_lat/lng) → destination hospital (drop_lat/lng).
  let etaText = "—";
  let distText = "—";
  if (b.last_lat != null && b.last_lng != null && b.drop_lat != null && b.drop_lng != null) {
    const km = haversineKm(
      { lat: Number(b.last_lat), lng: Number(b.last_lng) },
      { lat: Number(b.drop_lat), lng: Number(b.drop_lng) }
    );
    distText = fmtDistance(km);
    etaText = fmtEta(haversineEtaMin(km));
  }

  const acknowledge = async () => {
    setAcking(true);
    try {
      const res = await fetch(`/api/hospital-proxy/api/v1/hospital/bookings/${b.id}/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      if (res.ok) onAck();
    } catch {
      /* leave UI as-is; next poll reconciles */
    } finally {
      setAcking(false);
    }
  };

  const patientLine = [
    b.patient_name,
    b.patient_age ? `${b.patient_age}y` : null,
    b.patient_gender === "M" ? "Male" : b.patient_gender === "F" ? "Female" : b.patient_gender === "O" ? "Other" : null
  ].filter(Boolean).join(" · ");

  return (
    <div className="card" style={{ borderLeft: b.is_sos ? "4px solid var(--danger)" : "4px solid var(--accent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {b.is_sos ? (
            <span style={{ background: "rgba(220,38,38,0.12)", color: "var(--danger)", fontWeight: 800, fontSize: 11, letterSpacing: 0.5, padding: "4px 10px", borderRadius: 999 }}>🚨 SOS EMERGENCY</span>
          ) : (
            <span style={{ background: "rgba(30,94,255,0.10)", color: "var(--accent)", fontWeight: 700, fontSize: 11, letterSpacing: 0.5, padding: "4px 10px", borderRadius: 999 }}>🚑 BOOKING</span>
          )}
          <span style={{ fontWeight: 700 }}>{prettyEmergency(b.emergency_type)}</span>
          <span className="muted" style={{ fontSize: 12 }}>· #{b.display_id ?? b.id.slice(0, 8)}</span>
          <span className="muted" style={{ fontSize: 12 }}>· {prettyStatus(b.status)}</span>
        </div>
        <Link href={`/h/${b.id}`} style={{ color: "var(--accent)", fontSize: 13, fontWeight: 600 }}>View record →</Link>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "8px 20px", marginTop: 12 }}>
        <CardField label="Patient" value={patientLine || "—"} />
        <CardField label="Ambulance" value={b.ambulance_number ?? "—"} />
        <CardField
          label="Driver / Paramedic"
          value={
            b.driver_id ? (
              <Link href={`/h/drivers/${b.driver_id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>
                {b.driver_name ?? b.paramedic_name ?? "View driver"}
              </Link>
            ) : (
              b.driver_name ?? b.paramedic_name ?? "—"
            )
          }
        />
        <CardField label="Pickup" value={b.pickup_address ?? "—"} />
        <CardField label="ETA to hospital" value={etaText} />
        <CardField label="Distance" value={distText} />
      </div>

      <WorkflowIndicator step={step} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, gap: 8, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {b.accepted_at ? `Assigned ${relativeIST(b.accepted_at)}` : ""}
        </span>
        {acked ? (
          <span style={{ background: "rgba(16,185,129,0.12)", color: "var(--success)", fontWeight: 700, fontSize: 13, padding: "8px 14px", borderRadius: 8 }}>
            ✓ Preparing · acknowledged {formatTimeIST(b.hospital_ack_at!)}
          </span>
        ) : (
          <button
            onClick={acknowledge}
            disabled={acking}
            style={{ background: "var(--accent)", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: acking ? "default" : "pointer", opacity: acking ? 0.6 : 1 }}
          >
            {acking ? "Acknowledging…" : "Acknowledge — preparing"}
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkflowIndicator({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 14, flexWrap: "wrap" }}>
      {WORKFLOW_STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} title={label} style={{ flex: "1 1 0", minWidth: 28 }}>
            <div
              style={{
                height: 6,
                borderRadius: 999,
                background: done ? "var(--success)" : active ? "var(--accent)" : "var(--border)"
              }}
            />
            <div
              style={{
                fontSize: 9,
                marginTop: 4,
                color: active ? "var(--accent)" : done ? "var(--success)" : "var(--muted)",
                fontWeight: active ? 700 : 500,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              {n}. {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CardField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{value}</div>
    </div>
  );
}
