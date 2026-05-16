import React from "react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">JR</div>
          <div>
            <h2>Jeevan Rakshak</h2>
            <small>OPERATIONS</small>
          </div>
        </div>
        <nav>
          <a className="active" href="/">Live dashboard</a>
          <a href="/bookings">Bookings</a>
          <a href="/drivers">Drivers</a>
        </nav>
        <div className="footer">v0.2 demo · investor preview</div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
