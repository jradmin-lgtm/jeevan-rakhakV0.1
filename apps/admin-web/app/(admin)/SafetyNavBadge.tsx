"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";

// Small client component rendered inside the (server) admin layout nav. Polls
// the active safety-alert count every ~8s and shows a red badge beside the
// "Safety Alerts" link. The interval is cleared on unmount so there is no leak.
// Mirrors SupportNavBadge; tighter interval because a safety alert is a live,
// time-critical duress event (the badge + banner are the loud admin signal).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const POLL_MS = 8000;

export function SafetyNavBadge() {
  const [active, setActive] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${API_BASE}/api/v1/admin/safety/count`);
        // The same-origin proxy resolves (not throws) a JSON error body on a
        // transient 401/502 cold start. Skip this tick so a blip doesn't zero
        // the badge; a later good poll restores the real count.
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
    <a href="/safety-alerts" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span>Safety Alerts</span>
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
