import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side proxy for every /api/v1/hospital/* call the hospital portal
 * makes (CR#3, v1.2.0).
 *
 * Deliberately SEPARATE from app/api/proxy/[...path]/route.ts: that proxy
 * attaches the ADMIN_API_KEY and is the trust boundary for the ops team. This
 * hospital proxy must NEVER carry the admin key — a hospital user is scoped to
 * its own data by the role:"hospital" + hospitalId JWT claim and RBAC-checked
 * server-side. All it forwards is the hospital's session JWT as a Bearer token.
 *
 * - Reads the HTTP-only `jr-hospital-session` cookie (set by /api/hospital-login).
 * - Without that cookie → 401 (never reaches the API).
 * - Forwards `Authorization: Bearer <jwt>` + Content-Type; forwards no other
 *   client header, no cookie, and no admin key.
 */

const API_BASE =
  process.env.JR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const SESSION_COOKIE = "jr-hospital-session";

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "hospital_login_required" }, { status: 401 });
  }

  const { path } = await ctx.params;
  const search = req.nextUrl.search;
  const target = `${API_BASE}/${path.join("/")}${search}`;

  // Bearer JWT only — explicitly NOT the admin key. The proxy is the trust
  // boundary; we never forward the incoming cookie or any other client header.
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`
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
    return NextResponse.json(
      { error: "upstream_failed", message: String(err?.message ?? err) },
      { status: 502 }
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
