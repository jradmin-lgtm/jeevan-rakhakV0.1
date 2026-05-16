// Note: leaving the props type open so Next 15.5's auto-generated
// LayoutConfig<"/"> typecheck succeeds. The ReactNode/ReactPortal asymmetry
// in @types/react 19.0.x makes a strict `{ children: ReactNode }` annotation
// fail under Next's typed-routes validator even though runtime is identical.
// Cast at the destructure site instead.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AdminLayout({ children }: any) {
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
        <div className="footer">Jeevan Rakshak · v1.0</div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
