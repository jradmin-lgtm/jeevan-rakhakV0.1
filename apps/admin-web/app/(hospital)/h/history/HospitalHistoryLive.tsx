"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatIST, formatTimeIST } from "../../../../lib/dates";
import { prettyStatus, prettyEmergency } from "../../../../lib/status";
import { useHospitalSocket } from "../../HospitalSocketProvider";

/**
 * Hospital portal History (v1.2.1, CR#3). The full record of every ride to THIS
 * hospital regardless of status, fetched from /hospital/bookings?scope=all
 * (scoped server-side to dest_hospital_id=hid). Live: 10s poll + a refetch on
 * the `hospital:booking_update` socket event; both the interval and the socket
 * subscription are cleared on unmount (timer-leak rule).
 *
 * Every surface uses the locked human `#displayId` (never the raw UUID); the
 * UUID stays the routing key only (row → /h/<id> ride card, driver →
 * /h/drivers/<driverId> driver card when a driver is assigned).
 */

type HistoryRow = {
  id: string;
  display_id?: string | null;
  status: string;
  is_sos?: boolean;
  emergency_type: string;
  patient_name?: string | null;
  patient_age?: number | null;
  patient_gender?: string | null;
  driver_name?: string | null;
  driver_id?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
};

const POLL_MS = 10000;

function patientLine(r: HistoryRow): string {
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

// Best timestamp to show per row: when it ended (completed/cancelled) falls back
// to when it was created. The `all` query already returns newest-first by
// created_at, so this is purely the displayed "Time" column.
function rowTime(r: HistoryRow): string {
  const t = r.completed_at ?? r.cancelled_at ?? r.created_at;
  return t ? formatIST(t) : "—";
}

export function HospitalHistoryLive() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const { subscribe } = useHospitalSocket();
  const router = useRouter();
  const aliveRef = useRef(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital-proxy/api/v1/hospital/bookings?scope=all", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (!aliveRef.current) return;
      setRows(Array.isArray(json.bookings) ? json.bookings : []);
      setUpdatedAt(Date.now());
      setLoaded(true);
    } catch {
      /* keep last good */
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void fetchHistory();
    const id = setInterval(fetchHistory, POLL_MS);
    const unsub = subscribe("hospital:booking_update", () => {
      void fetchHistory();
    });
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      unsub();
    };
  }, [fetchHistory, subscribe]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>All rides · {rows.length}</h3>
          <span className="muted" style={{ fontSize: 12 }}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
            Live · refreshed {formatTimeIST(updatedAt)}
          </span>
        </div>
        {!loaded ? (
          <div className="muted">Loading ride history…</div>
        ) : rows.length === 0 ? (
          <div className="muted">No rides to your hospital yet. Completed and cancelled rides will appear here.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--muted)" }}>
                  <th style={{ padding: "8px 8px 8px 0" }}>Ride ID</th>
                  <th style={{ padding: 8 }}>Patient</th>
                  <th style={{ padding: 8 }}>Emergency</th>
                  <th style={{ padding: 8 }}>Driver</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/h/${r.id}`)}
                    style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                  >
                    <td style={{ padding: "10px 8px 10px 0", fontFamily: "var(--mono, monospace)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      #{r.display_id ?? "—"}
                    </td>
                    <td style={{ padding: 10 }}>{patientLine(r)}</td>
                    <td style={{ padding: 10 }}>{prettyEmergency(r.emergency_type)}</td>
                    <td style={{ padding: 10 }}>
                      {r.driver_id ? (
                        <Link
                          href={`/h/drivers/${r.driver_id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: "var(--accent)", fontWeight: 600 }}
                        >
                          {r.driver_name ?? "View driver"}
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
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
