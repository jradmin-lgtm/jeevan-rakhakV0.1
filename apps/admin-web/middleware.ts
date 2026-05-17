import { NextRequest, NextResponse } from "next/server";

/**
 * Edge middleware — first line of defence on the admin dashboard.
 *
 * Anyone without a valid `jr-admin-session` cookie gets bounced to
 * /admin-login. The cookie is HTTP-only and set by /api/admin-login on
 * correct password (see app/api/admin-login/route.ts).
 *
 * Skips: the /admin-login page itself, the /api/admin-login endpoint,
 * Next internals, and /privacy (public policy page).
 */

const SESSION_COOKIE = "jr-admin-session";
const SESSION_SECRET = process.env.JR_ADMIN_SESSION_SECRET ?? "dev-session-secret-change-in-prod";

const PUBLIC_PATHS = [
  "/admin-login",
  "/api/admin-login",
  "/privacy",
  "/_next",
  "/favicon",
  "/icon"
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
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
