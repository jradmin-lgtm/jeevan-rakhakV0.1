"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { formatTimeIST } from "../../../lib/dates";
import { useHospitalSocket } from "../HospitalSocketProvider";

/**
 * Hospital Dashboard analytics board (v1.2.2, Task 7). Renders above the live
 * incoming queue. Client-POV KPIs scoped to THIS hospital, fetched from
 * /hospital/analytics through the same-origin /api/hospital-proxy (which forwards
 * the hospital session JWT as a Bearer token — never the admin key). The endpoint
 * scopes every query to dest_hospital_id = req.user.hospitalId; nothing here can
 * surface another hospital's data.
 *
 * Live: 10s poll + a refetch on the `hospital:booking_update` socket event. Both
 * the interval and the socket subscription are cleared on unmount (timer-leak rule).
 *
 * Charts are pure CSS (no chart library — admin-web's only deps are
 * next/react/react-dom and intentionally carries no chart dependency).
 */

type Analytics = {
  incomingNow: number;
  preparingNow: number;
  arrivalsToday: number;
  sosToday: number;
  ridesTotal: number;
  avgPickupToHospitalMin: number | null;
  ambulances: { total: number; online: number; onTrip: number };
  last7Days: { day: string; count: number }[];
  byEmergencyType: { type: string; count: number }[];
  statusMix: { completed: number; active: number; cancelled: number };
};

const POLL_MS = 10000;

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

// Avg pickup→hospital minutes → "12m" / "1h 4m" / "-".
function fmtMinutes(min: number | null): string {
  if (min == null || !isFinite(min)) return "-";
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// "2026-06-07" → "Sat" (weekday short, in a TZ-agnostic way: the date string is
// already an IST calendar date from the server, so parse it as a plain date).
function weekdayShort(isoDay: string): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  if (!y || !m || !d) return isoDay;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export function HospitalKpis() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const { subscribe } = useHospitalSocket();
  const aliveRef = useRef(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/hospital-proxy/api/v1/hospital/analytics", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (!aliveRef.current) return;
      setData(json as Analytics);
      setUpdatedAt(Date.now());
      setLoaded(true);
    } catch {
      /* keep last good */
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void fetchAnalytics();
    const id = setInterval(fetchAnalytics, POLL_MS);
    // Live: refetch the moment a ride destined here changes (mirrors the queue).
    const unsub = subscribe("hospital:booking_update", () => {
      void fetchAnalytics();
    });
    return () => {
      aliveRef.current = false;
      clearInterval(id);
      unsub();
    };
  }, [fetchAnalytics, subscribe]);

  if (!loaded || !data) {
    return <div className="card muted">Loading dashboard analytics…</div>;
  }

  const a = data;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Today at a glance</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
          Live · refreshed {formatTimeIST(updatedAt)}
        </span>
      </div>

      {/* KPI cards — responsive grid, reuses the portal card surface. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Kpi label="Incoming now" value={a.incomingNow} accent="var(--accent)" />
        <Kpi label="Preparing now" value={a.preparingNow} accent="var(--warning)" />
        <Kpi label="Arrivals today" value={a.arrivalsToday} accent="var(--success)" />
        <Kpi label="Avg pickup → hospital" value={fmtMinutes(a.avgPickupToHospitalMin)} accent="var(--accent)" hint="last 30 days" />
        <Kpi
          label="Ambulances online"
          value={`${a.ambulances.online}/${a.ambulances.total}`}
          accent="var(--success)"
          hint={a.ambulances.onTrip ? `${a.ambulances.onTrip} on trip` : undefined}
        />
        <Kpi label="SOS today" value={a.sosToday} accent="var(--danger)" />
      </div>

      {/* Trends row — 7-day bars + case mix, side by side then stacking. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <SevenDayChart days={a.last7Days} />
        <CaseMix items={a.byEmergencyType} />
      </div>

      <StatusMix mix={a.statusMix} total={a.ridesTotal} />
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
  hint
}: {
  label: string;
  value: React.ReactNode;
  accent: string;
  hint?: string;
}) {
  return (
    <div className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: accent }}>{value}</div>
      {hint ? <div className="muted" style={{ fontSize: 11 }}>{hint}</div> : null}
    </div>
  );
}

function SevenDayChart({ days }: { days: { day: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const totalWeek = days.reduce((s, d) => s + d.count, 0);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Rides · last 7 days</h3>
        <span className="muted" style={{ fontSize: 12 }}>{totalWeek} total</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
        {days.map((d) => {
          const pct = (d.count / max) * 100;
          return (
            <div key={d.day} style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: d.count ? "var(--text)" : "var(--muted)" }}>{d.count}</div>
              <div title={`${d.day}: ${d.count}`} style={{ width: "100%", height: 90, display: "flex", alignItems: "flex-end" }}>
                <div
                  style={{
                    width: "100%",
                    height: `${Math.max(d.count ? 6 : 2, pct)}%`,
                    background: d.count
                      ? "linear-gradient(180deg, var(--accent), rgba(30,94,255,0.55))"
                      : "var(--border)",
                    borderRadius: "6px 6px 2px 2px",
                    transition: "height 0.3s ease"
                  }}
                />
              </div>
              <div className="muted" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{weekdayShort(d.day)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CaseMix({ items }: { items: { type: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 14 }}>Case mix by emergency · last 30 days</h3>
      {items.length === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No rides in the last 30 days.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((i) => {
            const pct = (i.count / max) * 100;
            return (
              <div key={i.type} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{prettyEmergency(i.type)}</span>
                  <span style={{ fontWeight: 700 }}>{i.count}</span>
                </div>
                <div style={{ height: 8, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(4, pct)}%`, height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 0.3s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusMix({ mix, total }: { mix: { completed: number; active: number; cancelled: number }; total: number }) {
  const segments = [
    { key: "completed", label: "Completed", count: mix.completed, color: "var(--success)" },
    { key: "active", label: "Active", count: mix.active, color: "var(--accent)" },
    { key: "cancelled", label: "Cancelled / timed out", count: mix.cancelled, color: "var(--muted)" }
  ];
  const sum = segments.reduce((s, seg) => s + seg.count, 0);
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Status mix · all-time</h3>
        <span className="muted" style={{ fontSize: 12 }}>{total} rides</span>
      </div>
      {sum === 0 ? (
        <div className="muted" style={{ fontSize: 13 }}>No rides to your hospital yet.</div>
      ) : (
        <>
          <div style={{ display: "flex", height: 12, borderRadius: 999, overflow: "hidden", background: "var(--border)" }}>
            {segments.map((seg) =>
              seg.count ? (
                <div
                  key={seg.key}
                  title={`${seg.label}: ${seg.count}`}
                  style={{ width: `${(seg.count / sum) * 100}%`, background: seg.color, transition: "width 0.3s ease" }}
                />
              ) : null
            )}
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {segments.map((seg) => (
              <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, display: "inline-block" }} />
                <span className="muted">{seg.label}</span>
                <span style={{ fontWeight: 700 }}>{seg.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
