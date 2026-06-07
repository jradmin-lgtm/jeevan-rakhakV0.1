"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminFetch } from "../../../../lib/adminFetch";
import { formatIST, formatTimeIST } from "../../../../lib/dates";

// Snake_case row straight off GET /api/v1/admin/safety (the admin list serves
// the full set joined with the responder list; there is no single-row admin
// endpoint, so the detail polls the list and picks its row by id). Mirrors the
// SafetyAlertsClient row shape.
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

const POLL_MS = 10000;
// localStorage key for the remembered operator name — shared with the support
// desk so the resolve dialog pre-fills with whoever is on shift. Same idiom as
// TicketDetailLive's OPERATOR_KEY.
const OPERATOR_KEY = "jr_support_operator_name";

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

function bookingRef(a: SafetyAlert): React.ReactNode {
  if (a.booking_id) {
    return (
      <Link href={`/bookings/${a.booking_id}`} style={{ color: "var(--accent)", textDecoration: "none" }}>
        #{a.display_id ?? "-"}
      </Link>
    );
  }
  return <span className="muted">#{a.display_id ?? "-"}</span>;
}

/**
 * Admin safety-alert card — polls GET /api/v1/admin/safety every 10s and picks
 * this alert's row by id so the status, responder list + resolution state stay
 * live without a manual refresh; the poll is cleared on unmount. Renders the
 * raiser, the ride #displayId, a Google Maps link to the raiser's location, the
 * responder list (driver name + responded time), the timestamps, and a gated
 * Mark-resolved dialog (closer's name, min 2 chars, surfaces the
 * resolver_name_required error) that POSTs /admin/safety/:id/resolve.
 */
export function SafetyAlertDetailLive({
  alertId,
  initialData,
  apiBase
}: {
  alertId: string;
  initialData: SafetyAlert;
  apiBase: string;
}) {
  const [data, setData] = useState<SafetyAlert>(initialData);
  const [lastFetch, setLastFetch] = useState<number>(Date.now());
  // Pause the poll's setData while the resolve round-trip is in flight so an
  // in-flight optimistic close isn't clobbered by a stale poll response.
  const mutatingRef = useRef(false);

  // Resolve dialog.
  const [resolveOpen, setResolveOpen] = useState(false);
  const [operator, setOperator] = useState<string>("");
  const [closerName, setCloserName] = useState<string>("");
  const [resolveBusy, setResolveBusy] = useState(false);
  const [resolveErr, setResolveErr] = useState<string | null>(null);

  // Remembered operator name (localStorage) → pre-fills the closer field.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(OPERATOR_KEY) ?? "";
      if (saved) setOperator(saved);
    } catch {
      /* localStorage unavailable — operator just types each time */
    }
  }, []);

  const pickRow = (alerts: SafetyAlert[]): SafetyAlert | null =>
    alerts.find((a) => a.id === alertId) ?? null;

  const refetch = async () => {
    const res = await adminFetch(`${apiBase}/api/v1/admin/safety?status=all`);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const payload = await res.json();
    const next = pickRow(payload.alerts ?? []);
    if (next) {
      setData(next);
      setLastFetch(Date.now());
    }
    return next;
  };

  // Live poll (10s) — cleared on unmount. Skips applying a stale response while
  // the resolve mutation is mid-flight. Keeps the last good row on a transient
  // error (the row may also vanish from the active set once resolved; we hold
  // the last good copy so the page never blanks).
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (mutatingRef.current) return;
      try {
        const res = await adminFetch(`${apiBase}/api/v1/admin/safety?status=all`);
        if (!res.ok) return;
        const payload = await res.json();
        const next = pickRow(payload.alerts ?? []);
        if (!alive || mutatingRef.current || !next) return;
        setData(next);
        setLastFetch(Date.now());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, alertId]);

  // Collapse the two-column grid to a single column under ~900px so the header
  // + responder list stack instead of cramping. Inline styles can't carry a
  // media query, so track the breakpoint here. Mirrors TicketDetailLive.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 900px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const rememberOperator = (name: string) => {
    try {
      if (name.trim()) window.localStorage.setItem(OPERATOR_KEY, name.trim());
    } catch {
      /* best-effort */
    }
  };

  function openResolve() {
    // Default the closer to the remembered operator on the desk.
    setCloserName(operator.trim());
    setResolveErr(null);
    setResolveOpen(true);
  }

  async function confirmResolve() {
    const resolvedBy = closerName.trim();
    if (resolvedBy.length < 2) {
      setResolveErr("Enter the closer's name (at least 2 characters).");
      return;
    }
    setResolveBusy(true);
    setResolveErr(null);
    mutatingRef.current = true;
    try {
      const res = await adminFetch(`${apiBase}/api/v1/admin/safety/${alertId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolvedBy })
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j.error === "resolver_name_required") {
          throw new Error("Enter the closer's name.");
        }
        throw new Error(j.error ?? `Resolve failed (${res.status})`);
      }
      rememberOperator(resolvedBy);
      setResolveOpen(false);
      await refetch();
    } catch (e: any) {
      setResolveErr(e?.message ?? "Could not resolve");
    } finally {
      mutatingRef.current = false;
      setResolveBusy(false);
    }
  }

  const raiser = alertRaiser(data);
  const rb = roleBadge(raiser.role);
  const sc = statusChip(data.status);
  const isActive = (data.status ?? "").toUpperCase() === "ACTIVE";
  const responders = data.responders ?? [];
  const mapsUrl = `https://www.google.com/maps?q=${data.lat},${data.lng}`;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={chipStyle(rb.bg, rb.fg)}>{rb.label}</span>
          <span style={chipStyle(sc.bg, sc.fg)}>{sc.label}</span>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--success)", marginRight: 6 }} />
          Live · refreshed {formatTimeIST(new Date(lastFetch))}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,2fr)",
          gap: 12
        }}
      >
        {/* Alert header + actions */}
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Safety alert</h3>
          <Field label="Raised by" value={`${raiser.name}`} />
          <Field label="Role" value={rb.label} />
          <Field label="Ride" value={bookingRef(data)} />
          <Field
            label="Location"
            value={
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Open in Google Maps
              </a>
            }
          />
          <Field label="Raised" value={formatIST(data.created_at)} />
          {(data.status ?? "").toUpperCase() === "RESOLVED" ? (
            <>
              <Field label="Resolved" value={data.resolved_at ? formatIST(data.resolved_at) : "-"} />
              <Field label="Resolved by" value={data.resolved_by ?? "-"} />
            </>
          ) : null}
          {(data.status ?? "").toUpperCase() === "CANCELLED" ? (
            <Field label="Stood down" value={data.cancelled_at ? formatIST(data.cancelled_at) : "-"} />
          ) : null}

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {isActive ? (
              <button type="button" onClick={openResolve} style={primaryBtn} title="Mark this safety alert resolved">
                Mark resolved…
              </button>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                This alert is closed. No further action needed.
              </span>
            )}
          </div>
        </div>

        {/* Responders — the grid gives this the wide (2fr) track. */}
        <div className="card" style={{ minWidth: 0 }}>
          <h3 style={{ margin: "0 0 12px" }}>Responders · {responders.length}</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {responders.length === 0 ? (
              <div className="muted">No driver has responded yet. Nearby available drivers were pinged on raise.</div>
            ) : (
              responders.map((r) => (
                <div
                  key={r.driver_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border, #E2E8F0)",
                    background: "rgba(59,130,246,0.04)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={chipStyle("rgba(59,130,246,0.12)", "#2563EB")}>Driver</span>
                    <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>{r.driver_name ?? "Driver"}</span>
                  </div>
                  <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    Responded {formatIST(r.responded_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Resolve dialog — requires the closer's name; surfaces resolver_name_required. */}
      {resolveOpen ? (
        <div onClick={() => !resolveBusy && setResolveOpen(false)} style={modalScrim}>
          <div onClick={(e) => e.stopPropagation()} style={modalBox}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>Mark this safety alert resolved?</div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "6px 0 16px", lineHeight: 1.5 }}>
              Closes the alert and clears the responder cards on the driver apps. Records who closed it.
            </p>
            <div style={fieldLabel}>Closed by</div>
            <input
              type="text"
              value={closerName}
              onChange={(e) => setCloserName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void confirmResolve(); }}
              autoFocus
              placeholder="Your name"
              style={modalInput}
            />
            {resolveErr ? <div style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{resolveErr}</div> : null}
            <div style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}>
              <button onClick={() => { setResolveOpen(false); setResolveErr(null); }} disabled={resolveBusy} style={cancelBtn}>Cancel</button>
              <button
                onClick={() => void confirmResolve()}
                disabled={resolveBusy || closerName.trim().length < 2}
                style={{ ...confirmBtn, opacity: resolveBusy || closerName.trim().length < 2 ? 0.5 : 1, cursor: resolveBusy || closerName.trim().length < 2 ? "not-allowed" : "pointer" }}
              >
                {resolveBusy ? "Resolving…" : "Resolve"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", gap: 12 }}>
      <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
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

const primaryBtn: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  padding: "8px 16px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};

const modalScrim: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000
};

const modalBox: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: 24,
  width: 440,
  maxWidth: "92vw",
  boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
  boxSizing: "border-box",
  display: "block"
};

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 600,
  marginBottom: 6,
  display: "block"
};

const modalInput: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  outline: "none",
  fontFamily: "inherit",
  color: "#0F172A",
  boxSizing: "border-box"
};

const cancelBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #CBD5E1",
  color: "#0F172A",
  padding: "8px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};

const confirmBtn: React.CSSProperties = {
  background: "#16A34A",
  border: "none",
  color: "#fff",
  padding: "8px 18px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer"
};
