"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";

// Single "Alerts" sidebar entry for the merged hub (Emergency Safety Alerts +
// System Alerts live under one page now). It carries the red active-safety
// count badge, because a live duress alert is the loud, time-critical signal
// the operator must not miss. Polls the lightweight count endpoint every ~8s;
// the interval is cleared on unmount so there is no leak. Keep-last-good on a
// transient 401/502 so a cold-start blip never zeroes the badge.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const POLL_MS = 8000;

export function AlertsNavBadge() {
  const [active, setActive] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${API_BASE}/api/v1/admin/safety/count`);
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setActive(Number(data?.active ?? 0));
      } catch {
        /* keep last good */
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <a href="/alerts" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span>Alerts</span>
      {active > 0 ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 18,
            height: 18,
            padding: "0 6px",
            borderRadius: 999,
            background: "#DC2626",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1
          }}
        >
          {active > 99 ? "99+" : active}
        </span>
      ) : null}
    </a>
  );
}
