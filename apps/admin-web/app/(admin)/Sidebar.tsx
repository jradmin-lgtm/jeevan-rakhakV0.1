"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { adminFetch } from "../../lib/adminFetch";

/**
 * Admin portal v2 sidebar.
 * - Route-aware active state (v1 hardcoded "Live dashboard" as active).
 * - Collapsible to an icon rail; persisted in localStorage; the state is
 *   mirrored onto <body class="nav-collapsed"> so the .shell grid follows.
 * - Alerts + Help & Support keep their live count badges (same endpoints,
 *   same keep-last-good polling discipline as the v1 badge components).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const COLLAPSE_KEY = "jr.admin.nav.collapsed";

function usePollCount(path: string, ms: number): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await adminFetch(`${API_BASE}${path}`);
        if (!res.ok) return; // keep-last-good on cold-start 401/502 blips
        const data = await res.json();
        if (!alive) return;
        setN(Number(data?.active ?? data?.open ?? 0));
      } catch { /* keep last good */ }
    };
    void tick();
    const id = setInterval(tick, ms);
    return () => { alive = false; clearInterval(id); };
  }, [path, ms]);
  return n;
}

type Item = { href: string; label: string; icon: React.ReactNode; badge?: number };

const I = {
  pulse: <path d="M2 12h4l2.5-7 4 14 2.5-7H22" />,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6" /></>,
  truck: <><path d="M2 7h11v9H2zM13 10h4.5L20 13v3h-7" /><circle cx="6.5" cy="17.5" r="1.6" /><circle cx="16.5" cy="17.5" r="1.6" /><path d="M6 11h3" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5" /><path d="M16 5.5a3 3 0 0 1 0 5.6M18.5 19c-.3-1.8-1.2-3.1-2.5-3.9" /></>,
  download: <><path d="M12 4v10m0 0 3.5-3.5M12 14l-3.5-3.5" /><path d="M5 17v2.2A1.8 1.8 0 0 0 6.8 21h10.4a1.8 1.8 0 0 0 1.8-1.8V17" /></>,
  star: <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8L12 4z" />,
  hospital: <><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M9 6V4h6v2M12 10v6m-3-3h6" /></>,
  bell: <><path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2.5H4.5L6 16z" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.5A2.6 2.6 0 0 1 12 8a2.5 2.5 0 0 1 2.5 2.5c0 1.8-2.5 2-2.5 3.6M12 17.2v.1" /></>,
};

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);
  const alerts = usePollCount("/api/v1/admin/safety/count", 8000);
  const tickets = usePollCount("/api/v1/admin/tickets/count", 30000);

  useEffect(() => {
    try { if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true); } catch { /* ignored */ }
  }, []);
  useEffect(() => {
    document.body.classList.toggle("nav-collapsed", collapsed);
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0"); } catch { /* ignored */ }
    return () => { document.body.classList.remove("nav-collapsed"); };
  }, [collapsed]);

  const items: Item[] = [
    { href: "/", label: "Live dashboard", icon: I.pulse },
    { href: "/bookings", label: "Bookings", icon: I.clipboard },
    { href: "/drivers", label: "Drivers", icon: I.truck },
    { href: "/users", label: "Users", icon: I.users },
    { href: "/app-installs", label: "App installs", icon: I.download },
    { href: "/feedback", label: "Feedback", icon: I.star },
    { href: "/hospitals", label: "Hospitals", icon: I.hospital },
    { href: "/alerts", label: "Alerts", icon: I.bell, badge: alerts },
    { href: "/support", label: "Help & Support", icon: I.help, badge: tickets },
  ];
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">JR</div>
        <div className="brand-text">
          <h2>Jeevan Rakshak</h2>
          <small>OPERATIONS</small>
        </div>
      </div>
      <nav>
        {items.map((it) => (
          <a key={it.href} href={it.href} className={isActive(it.href) ? "nav-item active" : "nav-item"} title={it.label}>
            <svg className="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {it.icon}
            </svg>
            <span className="nav-label">{it.label}</span>
            {it.badge && it.badge > 0 ? <span className="nav-badge">{it.badge > 99 ? "99+" : it.badge}</span> : null}
          </a>
        ))}
      </nav>
      <button className="nav-collapse" onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Expand menu" : "Collapse menu"}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
          style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform .25s ease" }}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
        <span className="nav-label">Collapse</span>
      </button>
      <div className="footer">Jeevan Rakshak Operations · v2.0</div>
    </aside>
  );
}
