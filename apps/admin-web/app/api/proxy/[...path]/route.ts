import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for every /api/v1/admin/* (and read-only /api/v1/*)
 * call the admin web makes. Before this proxy existed, the admin key was
 * baked into the client bundle via NEXT_PUBLIC_ADMIN_API_KEY — any visitor
 * to jr-admin.vercel.app could extract it from /_next/static/chunks/*.js
 * and call every admin endpoint. (Security audit finding #1, v1.0.11.4.)
 *
 * Now: the client calls /api/proxy/<path>, which runs on Vercel server
 * (not in the browser), reads ADMIN_API_KEY from the server-side env
 * (no NEXT_PUBLIC_ prefix), forwards the call, and returns the response.
 *
 * Additional gate: the proxy also checks for an `jr-admin-session` cookie
 * set by /admin-login. Without that cookie, all proxy calls return 401.
 * Combined: anyone hitting jr-admin.vercel.app has to know the dashboard
 * password before they can touch the API; even if they did, the admin
 * key never leaves the Vercel server.
 */

const API_BASE = process.env.JR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "dev-admin-key-change-in-prod";
const SESSION_COOKIE = "jr-admin-session";
const SESSION_SECRET = process.env.JR_ADMIN_SESSION_SECRET ?? "dev-session-secret-change-in-prod";

function isSessionValid(cookieValue: string | undefined): boolean {
  // Single shared secret for pilot. Once we add real per-admin accounts
  // this becomes a JWT/session-store lookup.
  return !!cookieValue && cookieValue === SESSION_SECRET;
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "admin_login_required" }, { status: 401 });
  }

  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const target = `${API_BASE}/${path.join("/")}${search}`;

  // Forward Content-Type for POST/PATCH; never forward the cookie or
  // any other client header — the proxy is the trust boundary.
  const headers: Record<string, string> = {
    "x-admin-key": ADMIN_API_KEY
  };
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store"
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const res = await fetch(target, init);
    const body = await res.text();
    const out = new NextResponse(body, { status: res.status });
    const contentType = res.headers.get("content-type");
    if (contentType) out.headers.set("content-type", contentType);
    return out;
  } catch (err: any) {
    return NextResponse.json({ error: "upstream_failed", message: String(err?.message ?? err) }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
