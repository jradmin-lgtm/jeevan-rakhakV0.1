"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../../lib/adminFetch";
import { formatIST, relativeIST } from "../../../lib/dates";

// Snake_case rows straight off GET /api/v1/admin/safety (joined with the raiser
// display name + the responder list off safety_alert_acks). Mirrors the support
// list row shape so the surface reads the same to ops.
type Responder = {
  driver_id: string;
  driver_name?: string | null;
  responded_at: string;
};

type SafetyAlert = {
  id: string;
  booking_id?: string | null;
  display_id?: string | null; // snapshot of the booking's #1000xx (locked id)
  raiser_role: string; // 'USER' | 'DRIVER'
  raiser_user_id?: string | null;
  raiser_user_name?: string | null;
  raiser_driver_id?: string | null;
  raiser_driver_name?: string | null;
  lat: number;
  lng: number;
  status: string; // 'ACTIVE' | 'RESOLVED' | 'CANCELLED'
  resolved_by?: string | null;
  resolved_at?: string | null;
  cancelled_at?: string | null;
  created_at: string;
  updated_at?: string | null;
  responders?: Responder[] | null;
};

// Active is the live view; the rest read history. The backend serves
// ?status=active|all, so anything that is not the live view fetches `all` and
// the client narrows Resolved / Cancelled below (keeps the API contract).
type StatusFilter = "ACTIVE" | "RESOLVED" | "CANCELLED" | "ALL";

function alertRaiser(a: SafetyAlert): { name: string; role: "USER" | "DRIVER" } {
  if ((a.raiser_role ?? "").toUpperCase() === "DRIVER") {
    return { name: a.raiser_driver_name ?? "Driver", role: "DRIVER" };
  }
  return { name: a.raiser_user_name ?? "User", role: "USER" };
}

function roleBadge(role: "USER" | "DRIVER"): { label: string; bg: string; fg: string } {
  if (role === "DRIVER") return { label: "Driver", bg: "rgba(59,130,246,0.12)", fg: "#2563EB" };
  return { label: "User", bg: "rgba(16,185,129,0.12)", fg: "#059669" };
}

function statusChip(status: string): { label: string; bg: string; fg: string } {
  const s = (status ?? "").toUpperCase();
  if (s === "RESOLVED") return { label: "Resolved", bg: "rgba(34,197,94,0.12)", fg: "#16A34A" };
  if (s === "CANCELLED") return { label: "Stood down", bg: "rgba(148,163,184,0.18)", fg: "#475569" };
  return { label: "Active", bg: "rgba(239,68,68,0.12)", fg: "#DC2626" };
}

export function SafetyAlertsClient({
  initialAlerts,
  apiBase
}: {
  initialAlerts: SafetyAlert[];
  apiBase: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusFilter>("ACTIVE");
  const [rows, setRows] = useState<SafetyAlert[]>(initialAlerts);
  // Distinct fetch-failure flag so a network/API error isn't painted as an
  // empty result (which would falsely read "no alerts").
  const [loadError, setLoadError] = useState(false);
  // Pause the poll's setRows while no mutation happens here today, but keep the
  // ref so the pattern matches the support list (and is ready if a row action
  // is ever added). A later good poll reconciles either way.
  const mutatingRef = useRef(false);
  // Recompute relative ages on every poll tick without re-fetching.
  const [now, setNow] = useState(() => Date.now());

  // The Active chip hits the live ?status=active endpoint; the other three
  // fetch the full set and narrow client-side (the API serves active|all).
  const query = status === "ACTIVE" ? "?status=active" : "?status=all";

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (mutatingRef.current) return;
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/safety${query}`);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const data = await res.json();
        if (!alive || mutatingRef.current) return;
        setRows(data.alerts ?? []);
        setNow(Date.now());
        setLoadError(false);
      } catch {
        // Keep last good rows, but flag the failure so the empty view doesn't
        // masquerade as "no alerts". A later good poll clears the flag.
        if (alive) setLoadError(true);
      }
    };
    void tick();
    const id = setInterval(tick, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apiBase, query]);

  // Newest-first, then narrow to the selected status (Active already arrives
  // pre-filtered from the endpoint, but the sort + client narrow is harmless).
  const visible = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (status === "ALL") return sorted;
    return sorted.filter((a) => (a.status ?? "").toUpperCase() === status);
  }, [rows, status]);

  const activeCount = useMemo(
    () => rows.filter((a) => (a.status ?? "").toUpperCase() === "ACTIVE").length,
    [rows]
  );

  function bookingLink(a: SafetyAlert): React.ReactNode {
    if (a.booking_id) {
      return (
        <a
          href={`/bookings/${a.booking_id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
        >
          #{a.display_id ?? "-"}
        </a>
      );
    }
    return <span className="muted">#{a.display_id ?? "-"}</span>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Safety Alerts</h1>
          <p>{activeCount} active · {visible.length} shown</p>
        </div>
      </div>

      {/* Status chips */}
      <div className="filter-bar">
        {(["ACTIVE", "RESOLVED", "CANCELLED", "ALL"] as StatusFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatus(f)}
            style={{
              padding: "6px 16px",
              borderRadius: 999,
              border: "1px solid var(--border, #E2E8F0)",
              background: status === f ? "var(--accent)" : "transparent",
              color: status === f ? "#fff" : "var(--ink, #0F172A)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            {f === "ACTIVE" ? "Active" : f === "RESOLVED" ? "Resolved" : f === "CANCELLED" ? "Stood down" : "All"}
          </button>
        ))}
        <span className="muted" style={{ fontSize: 12 }}>{visible.length} shown</span>
      </div>

      {visible.length === 0 && loadError ? (
        <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--danger, #DC2626)" }}>
          Could not load safety alerts · retrying every 10s. Check your connection; the list will refresh once it reconnects.
        </div>
      ) : visible.length === 0 ? (
        <div className="card muted" style={{ padding: 24, textAlign: "center" }}>
          No safety alerts in this view. Live alerts raised from an active ride land here · switch the chips above to see history.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted, #64748B)" }}>
                <th style={th}>Raised</th>
                <th style={th}>Ride</th>
                <th style={th}>Raised by</th>
                <th style={th}>Status</th>
                <th style={th}>Responders</th>
                <th style={th}>Age</th>
                <th style={th}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const raiser = alertRaiser(a);
                const rb = roleBadge(raiser.role);
                const sc = statusChip(a.status);
                const responderCount = (a.responders ?? []).length;
                return (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/safety-alerts/${a.id}`)}
                    style={{ borderTop: "1px solid var(--border, #E2E8F0)", cursor: "pointer" }}
                  >
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{formatIST(a.created_at)}</td>
                    <td style={td}>{bookingLink(a)}</td>
                    <td style={{ ...td, maxWidth: 220, overflowWrap: "anywhere" }}>
                      <span style={{ marginRight: 8 }}>{raiser.name}</span>
                      <span style={chipStyle(rb.bg, rb.fg)}>{rb.label}</span>
                    </td>
                    <td style={td}>
                      <span style={chipStyle(sc.bg, sc.fg)}>{sc.label}</span>
                    </td>
                    <td style={td}>
                      <span style={chipStyle("rgba(99,102,241,0.12)", "#4F46E5")}>
                        {responderCount} responding
                      </span>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{relativeIST(a.created_at, now)}</td>
                    <td style={td}>
                      <a
                        href={`/safety-alerts/${a.id}`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
                      >
                        Open →
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function chipStyle(bg: string, fg: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: bg,
    color: fg,
    whiteSpace: "nowrap"
  };
}

const th: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  fontWeight: 600
};

const td: React.CSSProperties = {
  padding: "10px 14px",
  color: "var(--ink, #0F172A)",
  verticalAlign: "top"
};
