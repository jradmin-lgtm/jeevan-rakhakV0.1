"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatTimeIST } from "../../../../lib/dates";
import { haversineKm, haversineEtaMin, fetchOsrmRoute, fmtDistance, fmtEta } from "../../../../lib/hospitalEta";
import { useHospitalSocket } from "../../HospitalSocketProvider";
import { HospitalMap } from "../../HospitalMap";
import { RaiseTicketForm } from "../../RaiseTicketForm";
import { workflowStep, WorkflowIndicator } from "../HospitalDashboardLive";

type Assessment = { [k: string]: any };

type HospitalRecord = {
  sectionA: {
    name?: string | null;
    age?: number | null;
    gender?: string | null;
    emergencyType?: string | null;
    condition?: string | null;
    notes?: string | null;
  };
  sectionB: Assessment | null;
  sectionC: {
    status: string;
    ambulanceLat?: number | null;
    ambulanceLng?: number | null;
    dropLat?: number | null;
    dropLng?: number | null;
    ackAt?: string | null;
  };
  paramedicName?: string | null;
  ambulanceNumber?: string | null;
  driverName?: string | null;
  displayId?: string | null;
  isSos?: boolean;
};

const POLL_MS = 10000;

function prettyEmergency(t?: string | null): string {
  switch (t) {
    case "ACCIDENT_TRAUMA": return "Accident / Trauma";
    case "CARDIAC": return "Cardiac";
    case "BREATHING_DISTRESS": return "Breathing distress";
    case "PREGNANCY_NEONATAL": return "Pregnancy / Neonatal";
    case "GENERAL_CRITICAL_TRANSFER": return "Critical transfer";
    default: return t ?? "—";
  }
}

function prettyStatus(s: string): string {
  switch (s) {
    case "ACCEPTED": return "Ambulance assigned";
    case "ARRIVED": return "At pickup";
    case "PICKED_UP": return "En route to hospital";
    case "COMPLETED": return "Arrived at hospital";
    default: return s;
  }
}

function prettyKey(k: string): string {
  return k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/_/g, " ").trim();
}

function prettyVal(v: any): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (typeof v === "string") return v.replace(/_/g, " ");
  return String(v);
}

export function PatientRecordLive({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<HospitalRecord | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [route, setRoute] = useState<{ coords: Array<[number, number]>; distanceKm: number; durationMin: number } | null>(null);
  const [acking, setAcking] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const { subscribe } = useHospitalSocket();
  const aliveRef = useRef(true);

  const fetchRecord = useCallback(async () => {
    try {
      const res = await fetch(`/api/hospital-proxy/api/v1/hospital/bookings/${bookingId}`, { cache: "no-store" });
      if (res.status === 404) {
        if (aliveRef.current) setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const json: HospitalRecord = await res.json();
      if (!aliveRef.current) return;
      setData(json);
      setUpdatedAt(Date.now());
    } catch {
      /* keep last good */
    }
  }, [bookingId]);

  useEffect(() => {
    aliveRef.current = true;
    void fetchRecord();
    const id = setInterval(fetchRecord, POLL_MS);
    const unsub = subscribe("hospital:booking_update", (payload: any) => {
      // Refetch only when the event concerns this booking (no id → refetch anyway).
      if (!payload?.bookingId || payload.bookingId === bookingId) void fetchRecord();
    });
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      unsub();
    };
  }, [fetchRecord, subscribe, bookingId]);

  // Fetch the real road route (OSRM) ambulance → hospital whenever the
  // ambulance position changes. Best-effort; falls back to haversine.
  const ambLat = data?.sectionC.ambulanceLat;
  const ambLng = data?.sectionC.ambulanceLng;
  const dropLat = data?.sectionC.dropLat;
  const dropLng = data?.sectionC.dropLng;
  useEffect(() => {
    if (ambLat == null || ambLng == null || dropLat == null || dropLng == null) {
      setRoute(null);
      return;
    }
    const ctrl = new AbortController();
    void fetchOsrmRoute(
      { lat: Number(ambLat), lng: Number(ambLng) },
      { lat: Number(dropLat), lng: Number(dropLng) },
      { signal: ctrl.signal }
    ).then((r) => {
      if (!ctrl.signal.aborted) setRoute(r);
    });
    return () => ctrl.abort();
  }, [ambLat, ambLng, dropLat, dropLng]);

  const acknowledge = async () => {
    setAcking(true);
    try {
      const res = await fetch(`/api/hospital-proxy/api/v1/hospital/bookings/${bookingId}/acknowledge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      if (res.ok) void fetchRecord();
    } catch {
      /* next poll reconciles */
    } finally {
      setAcking(false);
    }
  };

  if (notFound) {
    return <div className="card muted">This ride is not destined to your hospital, or no longer active.</div>;
  }
  if (!data) {
    return <div className="card muted">Loading patient record…</div>;
  }

  const a = data.sectionA;
  const b = data.sectionB;
  const c = data.sectionC;
  const acked = !!c.ackAt;

  // Locked human id — shown identically on every surface (queue, history,
  // driver card, here). The UUID stays a routing key only.
  const displayId = data.displayId ?? "—";

  // Live 8-step workflow position — same helper + indicator the incoming-queue
  // cards use, so the ride card mirrors the admin booking detail's liveness.
  // `sectionB` present means the paramedic assessment has been submitted.
  const step = workflowStep({ status: c.status, has_assessment: b != null, hospital_ack_at: c.ackAt });

  // ETA/distance: prefer OSRM road estimate, else straight-line haversine.
  let etaText = "—";
  let distText = "—";
  if (route) {
    distText = fmtDistance(route.distanceKm);
    etaText = fmtEta(route.durationMin);
  } else if (ambLat != null && ambLng != null && dropLat != null && dropLng != null) {
    const km = haversineKm({ lat: Number(ambLat), lng: Number(ambLng) }, { lat: Number(dropLat), lng: Number(dropLng) });
    distText = fmtDistance(km);
    etaText = fmtEta(haversineEtaMin(km));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {data.isSos ? (
              <span style={{ background: "rgba(220,38,38,0.12)", color: "var(--danger)", fontWeight: 800, fontSize: 11, letterSpacing: 0.5, padding: "4px 10px", borderRadius: 999 }}>🚨 SOS EMERGENCY</span>
            ) : null}
            <span style={{ fontFamily: "var(--mono, monospace)", fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>#{displayId}</span>
            <span className={`pill ${c.status.toLowerCase()}`}>{prettyStatus(c.status)}</span>
            <span style={{ fontWeight: 700 }}>{prettyEmergency(a.emergencyType)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
            {acked ? (
              <span style={{ background: "rgba(16,185,129,0.12)", color: "var(--success)", fontWeight: 700, fontSize: 13, padding: "8px 14px", borderRadius: 8 }}>
                ✓ Preparing · {formatTimeIST(c.ackAt!)}
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

        {/* Live 8-step workflow timeline — same indicator as the incoming-queue
          * cards, so the ride card reads identically and updates realtime. */}
        <WorkflowIndicator step={step} />
      </div>

      {/* Contextual ticket form — pre-filled RIDE + bookingId, subject locked.
        * Defaults to ISSUE (a concern); the form's type toggle lets the user
        * flip it to FEEDBACK if it's praise rather than a problem (v1.2.2). */}
      {showTicket ? (
        <RaiseTicketForm
          subjectType="RIDE"
          category="ISSUE"
          bookingId={bookingId}
          contextLabel={`Ride #${displayId}`}
          lockSubject
          onDone={() => setShowTicket(false)}
        />
      ) : null}

      {/* Section C — live transit (map + ETA) at top, so triage sees position first. */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Section C · Live transit</h3>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>ETA to hospital</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{etaText}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Distance</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{distText}</div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>Status</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{prettyStatus(c.status)}</div>
          </div>
        </div>
        <HospitalMap
          ambulance={ambLat != null && ambLng != null ? { lat: Number(ambLat), lng: Number(ambLng), label: data.ambulanceNumber ?? "Ambulance" } : null}
          destination={dropLat != null && dropLng != null ? { lat: Number(dropLat), lng: Number(dropLng), label: "Hospital" } : null}
          routePath={route?.coords ?? null}
        />
      </div>

      {/* Section A — patient */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Section A · Patient</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0 }}>
          <dt className="muted">Name</dt><dd style={{ margin: 0 }}>{a.name ?? "—"}</dd>
          <dt className="muted">Age</dt><dd style={{ margin: 0 }}>{a.age ?? "—"}</dd>
          <dt className="muted">Gender</dt><dd style={{ margin: 0 }}>{a.gender === "M" ? "Male" : a.gender === "F" ? "Female" : a.gender === "O" ? "Other" : a.gender ?? "—"}</dd>
          <dt className="muted">Emergency</dt><dd style={{ margin: 0 }}>{prettyEmergency(a.emergencyType)}</dd>
          <dt className="muted">Condition</dt><dd style={{ margin: 0 }}>{a.condition ? <strong style={{ color: "var(--danger)" }}>{a.condition}</strong> : "—"}</dd>
          <dt className="muted">Notes</dt><dd style={{ margin: 0 }}>{a.notes ?? "—"}</dd>
        </dl>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
          Ambulance {data.ambulanceNumber ?? "—"} · Paramedic {data.paramedicName ?? data.driverName ?? "—"}
        </div>
      </div>

      {/* Section B — paramedic assessment */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Section B · Paramedic assessment</h3>
        {b ? (
          <>
            {b.immediateRisk ? (
              <p style={{ color: "#B91C1C", fontWeight: 700 }}>🚨 IMMEDIATE RISK TO LIFE flagged by paramedic</p>
            ) : null}
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0 }}>
              {Object.entries(b)
                .filter(([k, v]) => !["recordedAt", "recordedBy", "immediateRisk", "notes"].includes(k) && v != null && v !== "")
                .map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="muted">{prettyKey(k)}</dt>
                    <dd style={{ margin: 0 }}>{prettyVal(v)}</dd>
                  </React.Fragment>
                ))}
            </dl>
            {b.notes ? <p style={{ marginTop: 10 }}><span className="muted">Notes: </span>{b.notes}</p> : null}
          </>
        ) : (
          <p className="muted">No paramedic assessment yet — appears here in real time as the paramedic records it.</p>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--muted)" }}>
        Confidential patient information. For use by treating clinicians at your hospital only.
      </p>
    </div>
  );
}
