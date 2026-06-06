import { cookies } from "next/headers";
import { HospitalLogoutButton } from "./HospitalLogoutButton";
import { HospitalSocketProvider } from "./HospitalSocketProvider";

/**
 * Hospital portal shell (CR#3, v1.2.0).
 *
 * Deliberately NOT under (admin): this route group has its own sidebar, its
 * own (teal) branding, scoped nav (Dashboard / Drivers) and a logout that
 * clears the hospital session cookie. It reuses the shared .shell/.sidebar
 * CSS from globals.css so it stays visually consistent with the ops dashboard
 * while reading as a clearly separate, hospital-branded portal.
 *
 * Live-socket token (CR#3): the hospital JWT lives in the HTTP-only
 * `jr-hospital-session` cookie, so the browser can't read it. We read it HERE
 * (server-side) and pass it to <HospitalSocketProvider> as a prop — the
 * server-component-prop approach. No token-leaking endpoint is added.
 *
 * Open props type — see the comment in (admin)/layout.tsx for the
 * @types/react 19.0.x typed-routes incompatibility this works around.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function HospitalLayout({ children }: any) {
  const token = (await cookies()).get("jr-hospital-session")?.value ?? null;
  return (
    <HospitalSocketProvider token={token}>
    <div className="shell">
      <aside className="sidebar" style={{ background: "linear-gradient(180deg, #0F2A28 0%, #134E48 100%)" }}>
        <div className="brand">
          <div className="brand-mark" style={{ background: "#0F766E", animation: "none" }}>
            JR
          </div>
          <div>
            <h2>Jeevan Rakshak</h2>
            <small>HOSPITAL PORTAL</small>
          </div>
        </div>
        <nav>
          <a className="active" href="/h">Dashboard</a>
          <a href="/h/drivers">Drivers</a>
        </nav>
        <div className="footer" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <HospitalLogoutButton />
          <span style={{ opacity: 0.5 }}>Jeevan Rakshak Hospital Portal · v1.2.0</span>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
    </HospitalSocketProvider>
  );
}
