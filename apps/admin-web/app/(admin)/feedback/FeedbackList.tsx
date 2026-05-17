"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST } from "../../../lib/dates";
import { downloadCsv } from "../../../lib/csv";
import { DateRangePicker, DateRange, Preset, presetToRange } from "../DateRange";

type Booking = {
  id: string;
  emergencyType: string;
  status: string;
  pickupAddress?: string | null;
  rating?: number | null;
  feedback?: string | null;
  ratingByDriver?: number | null;
  feedbackByDriver?: string | null;
  completedAt?: string | null;
  createdAt: string;
  isDemo?: boolean;
};

type Side = "all" | "user" | "driver";

const STARS = (n?: number | null) => n ? "★".repeat(n) + "☆".repeat(5 - n) : "—";

export function FeedbackList({ initialBookings, apiBase }: { initialBookings: Booking[]; apiBase: string }) {
  const [side, setSide] = useState<Side>("all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Booking[]>(initialBookings);
  const [preset, setPreset] = useState<Preset>("30d");
  const [range, setRange] = useState<DateRange>(presetToRange("30d"));

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const params = new URLSearchParams({ side });
        if (range.since) params.set("since", range.since);
        if (range.until) params.set("until", range.until);
        const res = await adminFetch(`${apiBase}/api/v1/admin/feedback?${params.toString()}`);
        const data = await res.json();
        if (!alive) return;
        setRows(data.bookings ?? []);
      } catch {
        /* keep last good */
      }
    };
    void tick();
    const id = setInterval(tick, 10000);
    return () => { alive = false; clearInterval(id); };
  }, [apiBase, side, range.since, range.until]);

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((b) =>
      (b.feedback ?? "").toLowerCase().includes(q) ||
      (b.feedbackByDriver ?? "").toLowerCase().includes(q) ||
      b.id.includes(q)
    );
  }, [rows, query]);

  const fromUsers = rows.filter((r) => r.feedback).length;
  const fromDrivers = rows.filter((r) => r.feedbackByDriver).length;

  const exportCsv = () => {
    downloadCsv(filtered, [
      { header: "Booking ID", value: (b) => b.id },
      { header: "Emergency", value: (b) => prettyEmergency(b.emergencyType) },
      { header: "Completed (IST)", value: (b) => b.completedAt ? formatIST(b.completedAt) : "" },
      { header: "Pickup", value: (b) => b.pickupAddress ?? "" },
      { header: "Patient rating", value: (b) => b.rating ?? "" },
      { header: "Patient feedback", value: (b) => b.feedback ?? "" },
      { header: "Driver rating", value: (b) => b.ratingByDriver ?? "" },
      { header: "Driver feedback", value: (b) => b.feedbackByDriver ?? "" }
    ], "jr-feedback");
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Feedback</h1>
          <p>{rows.length} in range · {fromUsers} from patients · {fromDrivers} from drivers</p>
        </div>
        <button onClick={exportCsv} style={{ background: "transparent", border: "1px solid var(--border, #E2E8F0)", color: "var(--ink, #0F172A)", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>⬇ Download CSV</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <DateRangePicker preset={preset} range={range} onChange={(p, r) => { setPreset(p); setRange(r); }} />
      </div>

      <div className="filter-bar">
        <select value={side} onChange={(e) => setSide(e.target.value as Side)}>
          <option value="all">Both sides</option>
          <option value="user">From patients</option>
          <option value="driver">From drivers</option>
        </select>
        <input
          type="text"
          placeholder="Search feedback text or booking id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} match</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.length === 0 ? (
          <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
            No feedback to show. Once trips complete and either side submits a rating, it appears here.
          </div>
        ) : (
          filtered.map((b) => (
            <div key={b.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <Link href={`/bookings/${b.id}`} style={{ color: "var(--accent)", fontWeight: 600, fontSize: 14 }}>
                    {b.id.slice(0, 8)}… · {prettyEmergency(b.emergencyType)}
                  </Link>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {b.pickupAddress ?? "—"} · completed {b.completedAt ? formatIST(b.completedAt) : "—"}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <FeedbackSide
                  who="Patient → driver"
                  rating={b.rating ?? null}
                  feedback={b.feedback ?? null}
                />
                <FeedbackSide
                  who="Driver → patient"
                  rating={b.ratingByDriver ?? null}
                  feedback={b.feedbackByDriver ?? null}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function FeedbackSide({ who, rating, feedback }: { who: string; rating: number | null; feedback: string | null }) {
  if (!rating && !feedback) {
    return (
      <div style={{ padding: 12, background: "rgba(148,163,184,0.06)", borderRadius: 8 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{who}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>No rating yet</div>
      </div>
    );
  }
  return (
    <div style={{ padding: 12, background: "rgba(245,158,11,0.05)", borderRadius: 8, border: "1px solid rgba(245,158,11,0.18)" }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 }}>{who}</div>
      <div style={{ marginTop: 4, fontSize: 16, color: "#F59E0B", letterSpacing: 1 }}>
        {STARS(rating)}
      </div>
      {feedback ? (
        <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink)", lineHeight: 1.4 }}>
          “{feedback}”
        </div>
      ) : null}
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
