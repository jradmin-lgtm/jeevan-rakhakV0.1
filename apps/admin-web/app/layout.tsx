import "./globals.css";
import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Jeevan Rakshak — Operations",
  description: "Live operations dashboard for emergency ambulance dispatch"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}
