"use client";

import React, { useEffect, useState } from "react";
import { adminFetch } from "../../lib/adminFetch";

// Small client component rendered inside the (server) admin layout nav. Polls
// the open-ticket count every ~30s and shows a red badge beside the "Help &
// Support" link. The interval is cleared on unmount so there is no leak.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const POLL_MS = 30000;

export function SupportNavBadge() {
  const [open, setOpen] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${API_BASE}/api/v1/admin/tickets/count`);
        const data = await res.json();
        if (!alive) return;
        setOpen(Number(data?.open ?? 0));
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
    <a href="/support" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span>Help &amp; Support</span>
      {open > 0 ? (
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
          {open > 99 ? "99+" : open}
        </span>
      ) : null}
    </a>
  );
}
