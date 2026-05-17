"use client";

import React from "react";

export type DateRange = {
  /** ISO date (YYYY-MM-DD) or empty for unbounded. */
  since: string;
  until: string;
};

export type Preset = "today" | "7d" | "30d" | "all" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d",    label: "Last 7 days" },
  { key: "30d",   label: "Last 30 days" },
  { key: "all",   label: "All time" },
  { key: "custom", label: "Custom" }
];

export function presetToRange(p: Preset): DateRange {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "today") {
    return { since: iso(today), until: iso(today) };
  }
  if (p === "7d") {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    return { since: iso(start), until: iso(today) };
  }
  if (p === "30d") {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return { since: iso(start), until: iso(today) };
  }
  return { since: "", until: "" };
}

/**
 * Date range picker shared across every admin list page.
 * - Preset chips for the most common windows
 * - Free-form date inputs when 'Custom' selected
 * - Emits ISO strings ready to pass as ?since= & ?until= query params
 */
export function DateRangePicker({
  preset,
  range,
  onChange
}: {
  preset: Preset;
  range: DateRange;
  onChange: (preset: Preset, range: DateRange) => void;
}) {
  return (
    <div style={styles.wrap}>
      <div style={styles.chips}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              if (p.key === "custom") {
                onChange("custom", range);
              } else {
                onChange(p.key, presetToRange(p.key));
              }
            }}
            style={p.key === preset ? { ...styles.chip, ...styles.chipActive } : styles.chip}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" ? (
        <div style={styles.dates}>
          <label style={styles.label}>
            From
            <input
              type="date"
              value={range.since}
              onChange={(e) => onChange("custom", { ...range, since: e.target.value })}
              style={styles.input}
            />
          </label>
          <label style={styles.label}>
            To
            <input
              type="date"
              value={range.until}
              onChange={(e) => onChange("custom", { ...range, until: e.target.value })}
              style={styles.input}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  chips: { display: "flex", gap: 6, flexWrap: "wrap" },
  chip: {
    background: "transparent",
    border: "1px solid var(--border, #E2E8F0)",
    color: "var(--muted, #64748B)",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    cursor: "pointer"
  },
  chipActive: {
    background: "#0F172A",
    color: "#fff",
    border: "1px solid #0F172A"
  },
  dates: { display: "flex", gap: 8 },
  label: { display: "flex", flexDirection: "column", gap: 2, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 },
  input: {
    padding: "6px 10px",
    border: "1px solid var(--border, #CBD5E1)",
    borderRadius: 6,
    fontSize: 13
  }
};
