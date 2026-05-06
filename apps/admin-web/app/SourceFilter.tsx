"use client";

import React from "react";

export type Source = "all" | "real" | "demo";

const TABS: { key: Source; label: string; sub: string }[] = [
  { key: "all",  label: "All",     sub: "real + demo" },
  { key: "real", label: "Real",    sub: "live traffic" },
  { key: "demo", label: "Demo",    sub: "seeded data" }
];

export function SourceFilter({ value, onChange }: { value: Source; onChange: (v: Source) => void }) {
  return (
    <div className="src-filter">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={t.key === value ? "src-tab active" : "src-tab"}
          onClick={() => onChange(t.key)}
        >
          <span className="src-tab-label">{t.label}</span>
          <span className="src-tab-sub">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}
