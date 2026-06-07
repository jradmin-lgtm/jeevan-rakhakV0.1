"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";

// Persistent red top banner for live safety alerts. Polls the active count
// every ~8s (same lightweight endpoint as SafetyNavBadge) and, when one or
// more alerts are active, renders a sticky full-width red bar across the top
// of the content area linking to the safety-alerts list. Renders nothing when
// the count is zero. The interval is cleared on unmount so there is no leak.
//
// Admin realtime is poll-based by design (no admin socket today); ~8s is the
// loud-but-cheap heartbeat the dashboard already uses.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const POLL_MS = 8000;

export function SafetyBanner() {
  const [active, setActive] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${API_BASE}/api/v1/admin/safety/count`);
        // Skip a transient failure (cold start / blip) so the banner doesn't
        // flicker off then back on. A later good poll reconciles.
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

  if (active <= 0) return null;

  const label =
    active === 1
      ? "1 active safety alert. Open now."
      : `${active} active safety alerts. Open now.`;

  return (
    <a
      href="/safety-alerts"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 900,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        padding: "12px 16px",
        marginBottom: 18,
        borderRadius: 10,
        background: "#DC2626",
        color: "#fff",
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: 0.2,
        textDecoration: "none",
        boxShadow: "0 6px 18px rgba(220,38,38,0.28)"
      }}
    >
      <span aria-hidden="true">🆘</span>
      <span>{label}</span>
      <span style={{ fontWeight: 600, opacity: 0.92, textDecoration: "underline" }}>View safety alerts</span>
    </a>
  );
}
