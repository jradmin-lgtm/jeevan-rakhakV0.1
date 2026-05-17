"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";
import { DateRangePicker, DateRange, Preset, presetToRange } from "./DateRange";

type Analytics = {
  since: string;
  until: string;
  bookingsPerDay: { day: string; count: number; completed: number; gmv: number; revenue: number }[];
  emergencyMix: { type: string; count: number }[];
  hourly: { hour: number; count: number }[];
  couponBreakdown: { code: string; uses: number; total_discount: number }[];
  stats: {
    totalBookings: number;
    completed: number;
    cancelled: number;
    active: number;
    completionRate: number;
    cancellationRate: number;
    avgFareInr: number;
    avgRating: number;
    gmvInr: number;
    revenueInr: number;
    discountGivenInr: number;
    couponBookings: number;
    profitEstimateInr: number;
    profitMarginPct: number;
    totalDrivers: number;
    liveDrivers: number;
    onTripDrivers: number;
    verifiedDrivers: number;
    totalUsers: number;
    activeUsers: number;
    liveUsers: number;
    avgTripMin: number;
    avgResponseMin: number;
    avgTripKm: number;
  };
  retention: {
    cohortSize: number;
    d1: { count: number; pct: number };
    d3: { count: number; pct: number };
    d7: { count: number; pct: number };
  };
};

/**
 * Holistic in-house analytics card. Sits below the live ops grid on the
 * home dashboard. Polled every 30s.
 *
 * Sections (in order of business importance):
 *   1. Money — GMV, Revenue, Discount given, Profit estimate, avg fare
 *   2. Volume — Total bookings, completion %, cancellation %
 *   3. Users + Drivers — total + live + verified driver count
 *   4. Retention — D1/D3/D7 cohort
 *   5. Trip averages — duration, response, distance
 *   6. Bookings per day sparkline (GMV / Revenue overlay)
 *   7. Hour-of-day distribution
 *   8. Emergency mix
 *   9. Coupon usage breakdown
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

  const s = data?.stats;

  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header + date range */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Analytics &amp; trends</h3>
            <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>
              {data ? `${data.bookingsPerDay.length} active days · ${s?.totalBookings ?? 0} bookings in range` : "Loading…"}
            </p>
          </div>
          <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
        </div>
      </div>

      {/* MONEY — GMV / Revenue / Discount / Profit */}
      <div className="card">
        <SectionLabel>💰 Money</SectionLabel>
        <Grid>
          <Stat label="GMV (gross)" value={inr(s?.gmvInr)} tone="primary" />
          <Stat label="Revenue (collected)" value={inr(s?.revenueInr)} tone="success" />
          <Stat label="Discount given" value={inr(s?.discountGivenInr)} tone="danger" sub={`${s?.couponBookings ?? 0} rides used coupons`} />
          <Stat label={`Profit (est ${s?.profitMarginPct ?? 20}% margin)`} value={inr(s?.profitEstimateInr)} sub="placeholder until driver payout lands" />
          <Stat label="Avg fare per ride" value={inr(s?.avgFareInr)} sub="completed only" />
          <Stat label="Discount per booking" value={s?.totalBookings ? inr(Math.round((s?.discountGivenInr ?? 0) / s.totalBookings)) : "—"} />
        </Grid>
      </div>

      {/* VOLUME — bookings status mix */}
      <div className="card">
        <SectionLabel>📊 Booking volume</SectionLabel>
        <Grid>
          <Stat label="Total bookings" value={s?.totalBookings ?? 0} />
          <Stat label="Completed" value={s?.completed ?? 0} tone="success" sub={`${s?.completionRate ?? 0}% completion`} />
          <Stat label="Cancelled" value={s?.cancelled ?? 0} tone="danger" sub={`${s?.cancellationRate ?? 0}% cancellation`} />
          <Stat label="In flight right now" value={s?.active ?? 0} tone="primary" />
          <Stat label="Avg rating" value={s?.avgRating ? `★ ${s.avgRating.toFixed(2)}` : "—"} sub="from rated trips" />
        </Grid>
      </div>

      {/* USERS + DRIVERS */}
      <div className="card">
        <SectionLabel>👥 People</SectionLabel>
        <Grid>
          <Stat label="Total users" value={s?.totalUsers ?? 0} />
          <Stat label="Active users (range)" value={s?.activeUsers ?? 0} sub="distinct users with bookings" />
          <Stat label="Live users" value={s?.liveUsers ?? 0} tone="primary" sub="in-flight rides right now" />
          <Stat label="Total drivers" value={s?.totalDrivers ?? 0} />
          <Stat label="Live drivers" value={s?.liveDrivers ?? 0} tone="success" sub={`${s?.onTripDrivers ?? 0} on trip`} />
          <Stat label="KYC verified" value={s?.verifiedDrivers ?? 0} sub={`of ${s?.totalDrivers ?? 0}`} />
        </Grid>
      </div>

      {/* RETENTION */}
      <div className="card">
        <SectionLabel>🔁 Retention (D1 / D3 / D7)</SectionLabel>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
          % of users who booked again N days after their first booking · cohort: users with first booking ≥ 7d ago ({data?.retention.cohortSize ?? 0} users)
        </div>
        <Grid>
          <Stat label="D1 retention" value={`${data?.retention.d1.pct ?? 0}%`} sub={`${data?.retention.d1.count ?? 0} users`} />
          <Stat label="D3 retention" value={`${data?.retention.d3.pct ?? 0}%`} sub={`${data?.retention.d3.count ?? 0} users`} />
          <Stat label="D7 retention" value={`${data?.retention.d7.pct ?? 0}%`} sub={`${data?.retention.d7.count ?? 0} users`} />
        </Grid>
      </div>

      {/* OPS QUALITY */}
      <div className="card">
        <SectionLabel>⚡ Operations quality</SectionLabel>
        <Grid>
          <Stat label="Avg trip duration" value={s?.avgTripMin ? `${s.avgTripMin.toFixed(1)} min` : "—"} sub="accept → complete" />
          <Stat label="Avg response time" value={s?.avgResponseMin ? `${s.avgResponseMin.toFixed(1)} min` : "—"} sub="request → accept" />
          <Stat label="Avg trip distance" value={s?.avgTripKm ? `${s.avgTripKm.toFixed(2)} km` : "—"} sub="pickup → drop (haversine)" />
        </Grid>
      </div>

      {/* SPARKLINE */}
      <div className="card">
        <SectionLabel>Bookings + Revenue per day</SectionLabel>
        <Sparkline series={data?.bookingsPerDay ?? []} />
      </div>

      {/* HOURLY HEATMAP */}
      <div className="card">
        <SectionLabel>Hour of day · IST</SectionLabel>
        <HourlyDistribution hourly={data?.hourly ?? []} />
      </div>

      {/* EMERGENCY MIX */}
      {data?.emergencyMix?.length ? (
        <div className="card">
          <SectionLabel>Emergency type mix</SectionLabel>
          <EmergencyMix mix={data.emergencyMix} total={s?.totalBookings ?? 0} />
        </div>
      ) : null}

      {/* COUPONS */}
      {data?.couponBreakdown?.length ? (
        <div className="card">
          <SectionLabel>Coupon usage</SectionLabel>
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>Code</th><th>Uses</th><th>Total discount given</th></tr>
            </thead>
            <tbody>
              {data.couponBreakdown.map((c) => (
                <tr key={c.code}>
                  <td className="mono">{c.code}</td>
                  <td>{c.uses}</td>
                  <td className="mono">{inr(c.total_discount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {loading && !data ? <p className="muted" style={{ fontSize: 12 }}>Loading analytics…</p> : null}
    </div>
  );
}

function inr(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10, fontWeight: 600 }}>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      {children}
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: string | number; tone?: "primary" | "success" | "danger"; sub?: string }) {
  const color = tone === "success" ? "var(--success, #10B981)" :
                tone === "danger" ? "var(--danger, #DC2626)" :
                tone === "primary" ? "var(--primary, #E5322B)" :
                "var(--ink, #0F172A)";
  return (
    <div style={{ background: "rgba(148,163,184,0.06)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function Sparkline({ series }: { series: { day: string; count: number; completed: number; gmv: number; revenue: number }[] }) {
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
        <polyline fill="none" stroke="rgba(30,94,255,0.35)" strokeWidth={2} points={points("count")} />
        <polyline fill="none" stroke="#10B981" strokeWidth={2} points={points("completed")} />
        {series.map((s, i) => {
          const x = PAD + i * step;
          const y = H - PAD - ((s.count / max) * (H - PAD * 2));
          return <circle key={s.day} cx={x} cy={y} r={2.5} fill="rgba(30,94,255,0.8)"><title>{`${s.day}: ${s.count} total, ${s.completed} completed, GMV ₹${s.gmv}, Revenue ₹${s.revenue}`}</title></circle>;
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "rgba(30,94,255,0.6)", marginRight: 6, verticalAlign: "middle" }} />Total</span>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "#10B981", marginRight: 6, verticalAlign: "middle" }} />Completed</span>
        <span style={{ marginLeft: "auto" }}>{series[0].day} → {series[series.length - 1].day} · hover dots for GMV/Revenue</span>
      </div>
    </div>
  );
}

function HourlyDistribution({ hourly }: { hourly: { hour: number; count: number }[] }) {
  // Build a full 24-hour spread with zeros where absent
  const map = new Map(hourly.map((h) => [h.hour, h.count]));
  const full = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: map.get(h) ?? 0 }));
  const max = Math.max(1, ...full.map((h) => h.count));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
        {full.map((h) => {
          const heightPct = (h.count / max) * 100;
          const isPeak = h.count === max && max > 0;
          return (
            <div key={h.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <div title={`${h.hour}:00 — ${h.count} bookings`}
                style={{
                  width: "100%",
                  height: `${Math.max(2, heightPct)}%`,
                  background: isPeak ? "var(--danger, #DC2626)" : "rgba(229,50,43,0.5)",
                  borderRadius: 2
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 3, fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
        {full.map((h) => (
          <div key={h.hour} style={{ flex: 1, textAlign: "center" }}>
            {h.hour % 3 === 0 ? `${h.hour}h` : ""}
          </div>
        ))}
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
            <div style={{ width: 160, color: "var(--ink)" }}>{prettyEmergency(m.type)}</div>
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
