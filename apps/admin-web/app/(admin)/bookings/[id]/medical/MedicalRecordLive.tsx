"use client";

import React, { useEffect, useRef, useState } from "react";
import { adminFetch } from "../../../../../lib/adminFetch";
import { formatTimeIST } from "../../../../../lib/dates";
import { prettyStatus, prettyEmergency } from "../../../../../lib/status";

type Medical = {
  bookingId: string;
  displayId?: string | null;
  status: string;
  ride: {
    displayId?: string | null;
    emergencyType: string;
    createdAt: string;
    pickupAddress?: string | null;
    dropAddress?: string | null;
    driver?: { name?: string | null; phone?: string | null; vehicleNumber?: string | null } | null;
  };
  patient: {
    name?: string | null;
    age?: number | null;
    gender?: string | null;
    condition?: string | null;
    conditions?: string[] | null;
    notes?: string | null;
    phone?: string | null;
    bloodGroup?: string | null;
    allergies?: string | null;
    locked: boolean;
  };
  assessment: { status: "pending" | "in_progress" | "submitted"; data: Record<string, any> | null };
  timeline: Array<{ type: string; at: string; actor: string }>;
};

const POLL_MS = 8000;

const STATUS_CHIP: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: "Pending", bg: "#FEF3C7", fg: "#92400E" },
  in_progress: { label: "In progress", bg: "#DBEAFE", fg: "#1E40AF" },
  submitted: { label: "Submitted", bg: "#DCFCE7", fg: "#166534" }
};

function prettyKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/_/g, " ")
    .trim();
}

function prettyVal(v: any): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  if (Array.isArray(v)) return v.map((x) => String(x).replace(/_/g, " ")).join(", ");
  if (typeof v === "string") return v.replace(/_/g, " ");
  return String(v);
}

/**
 * v1.1.0 (CR#9a) — live unified medical record. Polls every 8s so the
 * paramedic's assessment + the patient's submitted info surface in real time
 * (status chips: Pending → In progress → Submitted) before the ambulance
 * arrives, with a Share affordance for the receiving hospital.
 */
export function MedicalRecordLive({
  bookingId,
  initialData,
  apiBase
}: {
  bookingId: string;
  initialData: Medical;
  apiBase: string;
}) {
  const [data, setData] = useState<Medical>(initialData);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/bookings/${bookingId}/medical`);
        if (!res.ok) return;
        const json = await res.json();
        setData(json);
        setUpdatedAt(Date.now());
      } catch {
        /* keep last good */
      }
    };
    timer.current = setInterval(poll, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [bookingId, apiBase]);

  const share = async () => {
    // Share with the receiving hospital: copies a deep link to this record.
    // (Email/EMR push can replace this when a hospital channel is wired.)
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const chip = STATUS_CHIP[data.assessment.status] ?? STATUS_CHIP.pending;
  const a = data.assessment.data;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 700 }}>{prettyEmergency(data.ride.emergencyType)}</span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>· {prettyStatus(data.status)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Updated {formatTimeIST(updatedAt)}</span>
          <button
            onClick={share}
            style={{ fontSize: 13, fontWeight: 600, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 6, background: "#fff", cursor: "pointer" }}
          >
            {copied ? "✓ Link copied" : "↗ Share with hospital"}
          </button>
        </div>
      </div>

      {/* Section A — patient submitted */}
      <div className="card">
        <h3 style={{ marginTop: 0, display: "flex", gap: 8, alignItems: "center" }}>
          Section A · Patient
          {data.patient.locked ? (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#F1F5F9", color: "#475569" }}>🔒 locked at arrival</span>
          ) : (
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#FEF3C7", color: "#92400E" }}>editable until arrival</span>
          )}
        </h3>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0 }}>
          <dt className="muted">Name</dt><dd style={{ margin: 0 }}>{data.patient.name ?? "-"}</dd>
          <dt className="muted">Age</dt><dd style={{ margin: 0 }}>{data.patient.age ?? "-"}</dd>
          <dt className="muted">Gender</dt><dd style={{ margin: 0 }}>{data.patient.gender ?? "-"}</dd>
          <dt className="muted">Condition</dt><dd style={{ margin: 0 }}>{data.patient.conditions?.length ? data.patient.conditions.join(", ") : "-"}</dd>
          <dt className="muted">Blood group</dt><dd style={{ margin: 0 }}>{data.patient.bloodGroup ?? "-"}</dd>
          <dt className="muted">Allergies</dt><dd style={{ margin: 0 }}>{data.patient.allergies ?? "-"}</dd>
          <dt className="muted">Notes</dt><dd style={{ margin: 0 }}>{data.patient.notes ?? "-"}</dd>
          <dt className="muted">Phone</dt><dd style={{ margin: 0 }}>{data.patient.phone ?? "-"}</dd>
        </dl>
      </div>

      {/* Section B — paramedic assessment */}
      <div className="card">
        <h3 style={{ marginTop: 0, display: "flex", gap: 8, alignItems: "center" }}>
          Section B · Paramedic assessment
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: chip.bg, color: chip.fg }}>{chip.label}</span>
        </h3>
        {a ? (
          <>
            {a.immediateRisk ? (
              <p style={{ color: "#B91C1C", fontWeight: 700 }}>🚨 IMMEDIATE RISK TO LIFE flagged by paramedic</p>
            ) : null}
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", margin: 0 }}>
              {Object.entries(a)
                .filter(([k]) => !["recordedAt", "recordedBy", "immediateRisk", "notes"].includes(k))
                .map(([k, v]) => (
                  <React.Fragment key={k}>
                    <dt className="muted">{prettyKey(k)}</dt>
                    <dd style={{ margin: 0 }}>{prettyVal(v)}</dd>
                  </React.Fragment>
                ))}
            </dl>
            {a.notes ? <p style={{ marginTop: 10 }}><span className="muted">Notes: </span>{a.notes}</p> : null}
          </>
        ) : (
          <p className="muted">No paramedic assessment yet · appears here in real time as the paramedic records it.</p>
        )}
      </div>

      {/* Timeline */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Timeline</h3>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.timeline.map((e, i) => (
            <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>
              <span className="mono" style={{ color: "var(--muted)" }}>{formatTimeIST(e.at)}</span> · {e.type}
            </li>
          ))}
        </ul>
      </div>

      <p style={{ fontSize: 12, color: "var(--muted)" }}>
        Confidential patient information. Share only with treating clinicians.
      </p>
    </div>
  );
}
