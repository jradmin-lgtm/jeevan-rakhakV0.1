"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";
import { DateRangePicker, DateRange, Preset, presetToRange } from "./DateRange";

type Analytics = {
  since: string;
  until: string;
  bookingsPerDay: { day: string; count: number; completed: number; gmv: number; revenue: number }[];
  emergencyMix: { type: string; count: number }[];
  hourly: { hour: number; count: number; user_app: number; driver_app: number }[];
  couponBreakdown: { code: string; uses: number; total_discount: number }[];
  appTraffic: { day: string; user_app: number; driver_app: number }[];
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
    overriddenBookings?: number;
    avgGmvPerCompletedInr?: number;
    avgRevenuePerCompletedInr?: number;
    avgDiscountPerCompletedInr?: number;
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

const PALETTE = {
  overview: { tint: "rgba(15,23,42,0.04)",  bar: "#0F172A", icon: "📈", label: "Overview" },
  money:    { tint: "rgba(245,158,11,0.08)", bar: "#F59E0B", icon: "💰", label: "Money" },
  volume:   { tint: "rgba(139,92,246,0.07)", bar: "#7C3AED", icon: "📊", label: "Booking volume" },
  user:     { tint: "rgba(30,94,255,0.07)",  bar: "#1E5EFF", icon: "👥", label: "User app" },
  driver:   { tint: "rgba(229,50,43,0.07)",  bar: "#E5322B", icon: "🚑", label: "Driver app" },
  traffic:  { tint: "rgba(20,184,166,0.07)", bar: "#14B8A6", icon: "⏱️", label: "Hourly traffic" },
  retention:{ tint: "rgba(16,185,129,0.08)", bar: "#10B981", icon: "🔁", label: "Retention" },
  ops:      { tint: "rgba(249,115,22,0.07)", bar: "#F97316", icon: "⚡", label: "Operations quality" },
  emergency:{ tint: "rgba(220,38,38,0.05)",  bar: "#DC2626", icon: "🚨", label: "Emergency mix" },
  coupons:  { tint: "rgba(99,102,241,0.07)", bar: "#6366F1", icon: "🎟️", label: "Coupons" }
} as const;

type PaletteKey = keyof typeof PALETTE;

/**
 * Holistic in-house analytics dashboard. Sits below the live ops grid on
 * the home page. Polled every 30s.
 *
 * Layout (top → bottom):
 *   1. Date-range bar (sticky-feeling but actually inline)
 *   2. Overall summary — the 4 numbers the team checks first
 *   3. Money cards (gold accent)
 *   4. Volume cards (purple accent)
 *   5. User App ▮ Driver App  — side-by-side, each app's metrics own card
 *   6. Hourly traffic line — two lines (user / driver) over 24 hours IST
 *   7. Bookings + Revenue per day sparkline
 *   8. Retention (green accent)
 *   9. Ops quality (orange accent)
 *  10. Emergency mix (red bars)
 *  11. Coupon usage table
 *
 * Each section gets a coloured left accent bar so the eye can navigate
 * the dashboard quickly without reading every label.
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
      {/* Sticky date range — stays visible as the operator scrolls through
        * the 10 analytics sections so they never lose their filter
        * context. */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(247,248,251,0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid var(--border)",
        boxShadow: "0 2px 12px rgba(15,23,42,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>📈</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>Analytics &amp; trends</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>
              {data ? `${data.bookingsPerDay.length} active days · ${s?.totalBookings ?? 0} bookings in range` : "Loading…"}
            </div>
          </div>
        </div>
        <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
      </div>

      {/* Overview headlines — first cards under the sticky bar */}
      <Section kind="overview">
        <Grid cols={4}>
          <Stat label="Revenue (collected)" value={inr(s?.revenueInr)} tone="success" sub={`from ${s?.completed ?? 0} completed`} />
          <Stat label="GMV (gross fare)" value={inr(s?.gmvInr)} tone="primary" sub={s?.overriddenBookings ? `${s.overriddenBookings} fare-adjusted` : undefined} />
          <Stat label="Active users (range)" value={s?.activeUsers ?? 0} sub={`live now: ${s?.liveUsers ?? 0}`} />
          <Stat label="Live drivers" value={s?.liveDrivers ?? 0} tone="primary" sub={`${s?.onTripDrivers ?? 0} on trip · ${s?.totalDrivers ?? 0} total`} />
        </Grid>
      </Section>

      {/* Money */}
      <Section kind="money">
        <Grid cols={3}>
          <Stat label="GMV (gross)" value={inr(s?.gmvInr)} tone="primary" />
          <Stat label="Revenue (collected)" value={inr(s?.revenueInr)} tone="success" />
          <Stat label="Discount given" value={inr(s?.discountGivenInr)} tone="danger" sub={`${s?.couponBookings ?? 0} ride${(s?.couponBookings ?? 0) === 1 ? "" : "s"} used coupons`} />
          <Stat label={`Profit (est ${s?.profitMarginPct ?? 20}% margin)`} value={inr(s?.profitEstimateInr)} sub="placeholder until real payout model" />
          <Stat label="Avg fare per completed ride" value={inr(s?.avgGmvPerCompletedInr ?? s?.avgFareInr)} sub="GMV ÷ completed" />
          <Stat label="Discount per completed ride" value={inr(s?.avgDiscountPerCompletedInr)} sub="discount ÷ completed" />
        </Grid>
      </Section>

      {/* Volume */}
      <Section kind="volume">
        <Grid cols={4}>
          <Stat label="Total bookings" value={s?.totalBookings ?? 0} />
          <Stat label="Completed" value={s?.completed ?? 0} tone="success" sub={`${s?.completionRate ?? 0}% completion`} />
          <Stat label="Cancelled" value={s?.cancelled ?? 0} tone="danger" sub={`${s?.cancellationRate ?? 0}% cancellation`} />
          <Stat label="In flight right now" value={s?.active ?? 0} tone="primary" />
          <Stat label="Avg rating" value={s?.avgRating ? `★ ${s.avgRating.toFixed(2)}` : "—"} sub="from rated trips" />
        </Grid>
      </Section>

      {/* App-wise side-by-side: User app | Driver app */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Section kind="user">
          <Grid cols={2}>
            <Stat label="Total users" value={s?.totalUsers ?? 0} />
            <Stat label="Active (range)" value={s?.activeUsers ?? 0} tone="primary" />
            <Stat label="Live now" value={s?.liveUsers ?? 0} sub="in-flight bookings" />
            <Stat label="Avg fare seen" value={inr(s?.avgFareInr)} sub="from completed rides" />
          </Grid>
        </Section>
        <Section kind="driver">
          <Grid cols={2}>
            <Stat label="Total drivers" value={s?.totalDrivers ?? 0} />
            <Stat label="KYC verified" value={s?.verifiedDrivers ?? 0} tone="success" sub={`of ${s?.totalDrivers ?? 0}`} />
            <Stat label="Online now" value={s?.liveDrivers ?? 0} tone="primary" sub={`${s?.onTripDrivers ?? 0} on trip`} />
            <Stat label="Avg response time" value={s?.avgResponseMin ? `${s.avgResponseMin.toFixed(1)} min` : "—"} sub="request → accept" />
          </Grid>
        </Section>
      </div>

      {/* Hourly traffic — user app vs driver app */}
      <Section kind="traffic" subtitle="Avg distinct active users (user app) and accepting drivers (driver app) per hour of day · IST">
        <HourlyTrend hourly={data?.hourly ?? []} />
      </Section>

      {/* Bookings + Revenue per day sparkline */}
      <Section kind="volume" titleOverride="Bookings + Revenue per day">
        <Sparkline series={data?.bookingsPerDay ?? []} />
      </Section>

      {/* Retention */}
      <Section kind="retention" subtitle={`Cohort: users with first booking ≥ 7 days ago (${data?.retention.cohortSize ?? 0} users) · % who booked again N days after their first booking`}>
        <Grid cols={3}>
          <Stat label="D1 retention" value={`${data?.retention.d1.pct ?? 0}%`} sub={`${data?.retention.d1.count ?? 0} users`} />
          <Stat label="D3 retention" value={`${data?.retention.d3.pct ?? 0}%`} sub={`${data?.retention.d3.count ?? 0} users`} />
          <Stat label="D7 retention" value={`${data?.retention.d7.pct ?? 0}%`} sub={`${data?.retention.d7.count ?? 0} users`} />
        </Grid>
      </Section>

      {/* Ops quality */}
      <Section kind="ops">
        <Grid cols={3}>
          <Stat label="Avg trip duration" value={s?.avgTripMin ? `${s.avgTripMin.toFixed(1)} min` : "—"} sub="accept → complete" />
          <Stat label="Avg response time" value={s?.avgResponseMin ? `${s.avgResponseMin.toFixed(1)} min` : "—"} sub="request → accept" />
          <Stat label="Avg trip distance" value={s?.avgTripKm ? `${s.avgTripKm.toFixed(2)} km` : "—"} sub="pickup → drop (haversine)" />
        </Grid>
      </Section>

      {/* Emergency mix */}
      {data?.emergencyMix?.length ? (
        <Section kind="emergency">
          <EmergencyMix mix={data.emergencyMix} total={s?.totalBookings ?? 0} />
        </Section>
      ) : null}

      {/* Coupons */}
      {data?.couponBreakdown?.length ? (
        <Section kind="coupons">
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
        </Section>
      ) : null}

      {loading && !data ? <p className="muted" style={{ fontSize: 12 }}>Loading analytics…</p> : null}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function inr(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(2)} L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
}

function Section({ kind, children, subtitle, titleOverride, headerRight }: {
  kind: PaletteKey;
  children: React.ReactNode;
  subtitle?: string;
  titleOverride?: string;
  headerRight?: React.ReactNode;
}) {
  const p = PALETTE[kind];
  return (
    <div className="card" style={{ borderLeft: `4px solid ${p.bar}`, background: `linear-gradient(180deg, ${p.tint} 0%, #fff 38%)` }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{p.icon}</span>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: -0.01, color: p.bar }}>
              {titleOverride ?? p.label}
            </h3>
          </div>
          {subtitle ? <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>{subtitle}</p> : null}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function Grid({ children, cols = 3 }: { children: React.ReactNode; cols?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${cols >= 4 ? "150px" : "180px"}, 1fr))`, gap: 10 }}>
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
    <div style={{ background: "rgba(255,255,255,0.55)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(15,23,42,0.04)" }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 4, letterSpacing: "-0.02em" }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function HourlyTrend({ hourly }: { hourly: { hour: number; count: number; user_app: number; driver_app: number }[] }) {
  if (!hourly.length) {
    return <div className="muted" style={{ fontSize: 12 }}>No traffic data in range.</div>;
  }
  // Server always returns all 24 rows (LEFT JOIN on generate_series).
  const W = 720;
  const H = 180;
  const PAD_L = 36;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 24;
  const max = Math.max(1, ...hourly.map((h) => Math.max(h.user_app, h.driver_app)));
  const stepX = (W - PAD_L - PAD_R) / 23;

  const points = (key: "user_app" | "driver_app") =>
    hourly.map((h) => {
      const x = PAD_L + h.hour * stepX;
      const y = H - PAD_B - ((h[key] / max) * (H - PAD_T - PAD_B));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

  // Gridlines for y axis (3 + zero).
  const yTicks = [0, Math.ceil(max / 3), Math.ceil((max / 3) * 2), max].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
        {/* Grid */}
        {yTicks.map((v) => {
          const y = H - PAD_B - ((v / max) * (H - PAD_T - PAD_B));
          return (
            <g key={v}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="rgba(15,23,42,0.06)" strokeDasharray="3,4" />
              <text x={PAD_L - 6} y={y + 4} fontSize="10" textAnchor="end" fill="var(--muted)">{v}</text>
            </g>
          );
        })}
        {/* Lines + area fills */}
        <defs>
          <linearGradient id="userFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1E5EFF" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1E5EFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="driverFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E5322B" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#E5322B" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Area under user line */}
        <polygon
          fill="url(#userFill)"
          points={`${PAD_L},${H - PAD_B} ${points("user_app")} ${PAD_L + 23 * stepX},${H - PAD_B}`}
        />
        <polyline fill="none" stroke="#1E5EFF" strokeWidth={2.5} points={points("user_app")} />
        {/* Area under driver line */}
        <polygon
          fill="url(#driverFill)"
          points={`${PAD_L},${H - PAD_B} ${points("driver_app")} ${PAD_L + 23 * stepX},${H - PAD_B}`}
        />
        <polyline fill="none" stroke="#E5322B" strokeWidth={2.5} points={points("driver_app")} />
        {/* Dots with tooltips */}
        {hourly.map((h) => (
          <g key={h.hour}>
            <circle cx={PAD_L + h.hour * stepX} cy={H - PAD_B - ((h.user_app / max) * (H - PAD_T - PAD_B))} r={3} fill="#1E5EFF">
              <title>{`${h.hour}:00 IST — user app: ${h.user_app}`}</title>
            </circle>
            <circle cx={PAD_L + h.hour * stepX} cy={H - PAD_B - ((h.driver_app / max) * (H - PAD_T - PAD_B))} r={3} fill="#E5322B">
              <title>{`${h.hour}:00 IST — driver app: ${h.driver_app}`}</title>
            </circle>
          </g>
        ))}
        {/* X axis */}
        {[0, 6, 12, 18, 23].map((hr) => (
          <text key={hr} x={PAD_L + hr * stepX} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">{hr}:00</text>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 18, fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "#1E5EFF", marginRight: 6, verticalAlign: "middle" }} />User app (booking created)</span>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "#E5322B", marginRight: 6, verticalAlign: "middle" }} />Driver app (ride accepted)</span>
      </div>
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
        <polyline fill="none" stroke="rgba(124,58,237,0.35)" strokeWidth={2} points={points("count")} />
        <polyline fill="none" stroke="#10B981" strokeWidth={2} points={points("completed")} />
        {series.map((s, i) => {
          const x = PAD + i * step;
          const y = H - PAD - ((s.count / max) * (H - PAD * 2));
          return <circle key={s.day} cx={x} cy={y} r={2.5} fill="#7C3AED"><title>{`${s.day}: ${s.count} total, ${s.completed} completed, GMV ₹${s.gmv}, Revenue ₹${s.revenue}`}</title></circle>;
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "#7C3AED", marginRight: 6, verticalAlign: "middle" }} />Total</span>
        <span><span style={{ display: "inline-block", width: 10, height: 2, background: "#10B981", marginRight: 6, verticalAlign: "middle" }} />Completed</span>
        <span style={{ marginLeft: "auto" }}>{series[0].day} → {series[series.length - 1].day} · hover dots for GMV/Revenue</span>
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
            <div style={{ flex: 1, background: "rgba(220,38,38,0.06)", borderRadius: 4, overflow: "hidden", height: 18 }}>
              <div style={{ width: `${w}%`, background: "#DC2626", height: "100%", transition: "width 0.4s ease" }} />
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
