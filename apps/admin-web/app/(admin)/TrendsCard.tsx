"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";
import { DateRangePicker, DateRange, Preset, presetToRange } from "./DateRange";

type Analytics = {
  since: string;
  until: string;
  bookingsPerDay: { day: string; count: number; completed: number }[];
  emergencyMix: { type: string; count: number }[];
  stats: {
    totalBookings: number;
    completed: number;
    cancelled: number;
    completionRate: number;
    cancellationRate: number;
    avgFareInr: number;
    avgRating: number;
  };
};

/**
 * Inline trends card for the home dashboard. Renders:
 *   - Date range picker (defaults to last 30 days)
 *   - Headline stats: total bookings, completion %, avg fare, avg rating
 *   - Sparkline of bookings per day (created + completed split)
 *   - Emergency-type mix as a horizontal bar list
 *
 * No charting library — pure inline SVG for the sparkline. Keeps the
 * admin bundle tiny and there's nothing to break across React/Next
 * versions.
 */
export function TrendsCard({ apiBase }: { apiBase: string }) {
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState<DateRange>(presetToRange("30d"));
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const params = new URLSearchParams();
        if (range.since) params.set("since", range.since);
        if (range.until) params.set("until", range.until);
        const qs = params.toString();
        const res = await adminFetch(`${apiBase}/api/v1/admin/analytics${qs ? "?" + qs : ""}`);
        if (!res.ok) return;
        const d = await res.json();
        if (alive) setData(d);
      } catch {
        /* keep last good */
      } finally {
        if (alive) setLoading(false);
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, [apiBase, range.since, range.until]);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Trends &amp; analytics</h3>
          <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
            {data ? `${data.bookingsPerDay.length} active days · ${data.stats.totalBookings} bookings` : "Loading…"}
          </p>
        </div>
        <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
      </div>

      {/* Headline stats */}
      <div style={statsRow}>
        <Stat label="Bookings" value={data?.stats.totalBookings ?? 0} />
        <Stat label="Completion %" value={`${data?.stats.completionRate ?? 0}%`} tone="success" />
        <Stat label="Cancellation %" value={`${data?.stats.cancellationRate ?? 0}%`} tone="danger" />
        <Stat label="Avg fare" value={`₹${data?.stats.avgFareInr ?? 0}`} />
        <Stat label="Avg rating" value={data?.stats.avgRating ? `★ ${data.stats.avgRating.toFixed(2)}` : "—"} />
      </div>

      {/* Sparkline */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
          Bookings per day
        </div>
        <Sparkline series={data?.bookingsPerDay ?? []} />
      </div>

      {/* Emergency mix */}
      {data?.emergencyMix?.length ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Emergency mix
          </div>
          <EmergencyMix mix={data.emergencyMix} total={data.stats.totalBookings} />
        </div>
      ) : null}

      {loading && !data ? <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Loading analytics…</p> : null}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "var(--success, #10B981)" : tone === "danger" ? "var(--danger, #DC2626)" : "var(--ink, #0F172A)";
  return (
    <div style={statBox}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Sparkline({ series }: { series: { day: string; count: number; completed: number }[] }) {
  if (!series.length) {
    return <div className="muted" style={{ fontSize: 12 }}>No data in range.</div>;
  }
  const W = 720;
  const H = 110;
  const PAD = 8;
  const max = Math.max(1, ...series.map((s) => s.count));
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;

  const points = (key: "count" | "completed") =>
    series.map((s, i) => {
      const x = PAD + i * step;
      const y = H - PAD - ((s[key] / max) * (H - PAD * 2));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, display: "block" }}>
        <polyline fill="none" stroke="rgba(30,94,255,0.25)" strokeWidth={2} points={points("count")} />
        <polyline fill="none" stroke="#10B981" strokeWidth={2} points={points("completed")} />
        {series.map((s, i) => {
          const x = PAD + i * step;
          const y = H - PAD - ((s.count / max) * (H - PAD * 2));
          return <circle key={s.day} cx={x} cy={y} r={2.5} fill="rgba(30,94,255,0.7)"><title>{`${s.day}: ${s.count} total / ${s.completed} completed`}</title></circle>;
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "rgba(30,94,255,0.6)", marginRight: 6, verticalAlign: "middle" }} />Total</span>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "#10B981", marginRight: 6, verticalAlign: "middle" }} />Completed</span>
        <span style={{ marginLeft: "auto" }}>{series[0].day} → {series[series.length - 1].day}</span>
      </div>
    </div>
  );
}

function EmergencyMix({ mix, total }: { mix: { type: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...mix.map((m) => m.count));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {mix.map((m) => {
        const pct = total > 0 ? Math.round((m.count / total) * 100) : 0;
        const w = Math.round((m.count / max) * 100);
        return (
          <div key={m.type} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <div style={{ width: 140, color: "var(--ink)" }}>{prettyEmergency(m.type)}</div>
            <div style={{ flex: 1, background: "rgba(229,50,43,0.08)", borderRadius: 4, overflow: "hidden", height: 18 }}>
              <div style={{ width: `${w}%`, background: "#E5322B", height: "100%" }} />
            </div>
            <div style={{ width: 80, textAlign: "right", color: "var(--muted)", fontSize: 12 }}>{m.count} · {pct}%</div>
          </div>
        );
      })}
    </div>
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

const statsRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10
};

const statBox: React.CSSProperties = {
  background: "rgba(148,163,184,0.06)",
  borderRadius: 8,
  padding: "12px 14px"
};
