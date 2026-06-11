import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware — first line of defence on the admin dashboard.
 *
 * Anyone without a valid `jr-admin-session` cookie gets bounced to
 * /admin-login. The cookie is HTTP-only and set by /api/admin-login on
 * correct password (see app/api/admin-login/route.ts).
 *
 * Skips: the /admin-login page itself, the /api/admin-login endpoint,
 * Next internals, /privacy (public policy page), and the hospital portal
 * (CR#3, v1.2.0) which is a SEPARATE auth domain — it has its own
 * /hospital-login + jr-hospital-session cookie and is gated by the hospital
 * proxy server-side, so it must not be bounced to the admin login.
 */

const SESSION_COOKIE = "jr-admin-session";
const SESSION_SECRET = process.env.JR_ADMIN_SESSION_SECRET ?? "dev-session-secret-change-in-prod";

const PUBLIC_PATHS = [
  "/admin-login",
  "/api/admin-login",
  "/privacy",
  "/delete-account",
  "/download-apk",
  "/api/dl",
  "/user-app-icon.png",
  "/driver-app-icon.png",
  "/qr-download-apk.png",
  "/_next",
  "/favicon",
  "/icon",
  // Hospital portal — its own auth domain (jr-hospital-session), gated by the
  // hospital proxy. Not part of the admin gate. (The /h dashboard group is
  // matched separately below so it does not collide with /hospitals.)
  "/hospital-login",
  "/api/hospital-login",
  "/api/hospital-proxy"
];

/**
 * The hospital dashboard route group resolves to /h and /h/*. Matched as an
 * exact-or-subpath check (NOT a bare startsWith) so it never swallows the
 * existing /hospitals admin pages.
 */
function isHospitalDashboardPath(pathname: string): boolean {
  return pathname === "/h" || pathname.startsWith("/h/");
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  // Hospital dashboard group: its own auth domain. The hospital proxy already
  // 401s every data call without the jr-hospital-session cookie, so no patient
  // data can leak — but bounce a logged-out visitor to /hospital-login instead
  // of rendering an empty authenticated-looking shell (symmetric with the admin
  // gate below). Cookie-presence is enough for the UX redirect; the proxy does
  // the real auth.
  if (isHospitalDashboardPath(pathname)) {
    if (req.cookies.get("jr-hospital-session")?.value) {
      return NextResponse.next();
    }
    const hLogin = req.nextUrl.clone();
    hLogin.pathname = "/hospital-login";
    return NextResponse.redirect(hLogin);
  }
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (session === SESSION_SECRET) {
    return NextResponse.next();
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/admin-login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on all paths — the function itself filters PUBLIC_PATHS.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
