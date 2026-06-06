import { NextRequest, NextResponse } from "next/server";

/**
 * Hospital portal login gate (CR#3, v1.2.0).
 *
 * Mirrors app/api/admin-login/route.ts in shape, but the session here is a
 * REAL credentialed login — not a single shared password. We forward
 * {username,password} to the api-server's /api/v1/hospital/login, which
 * verifies the bcrypt/scrypt hash and signs a role:"hospital" + hospitalId
 * JWT. On success we store that JWT in an HTTP-only cookie `jr-hospital-session`
 * (the JWT itself, NOT a static secret) so the hospital proxy can forward it
 * as `Authorization: Bearer <jwt>`. The browser never sees the token.
 *
 * - POST {username,password} → set the cookie (maxAge 8h, matches the JWT TTL).
 * - DELETE → clear the cookie (logout).
 */

const API_BASE =
  process.env.JR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
const SESSION_COOKIE = "jr-hospital-session";
const SESSION_TTL_SEC = 60 * 60 * 8;

export async function POST(req: NextRequest) {
  let username = "";
  let password = "";
  try {
    const body = await req.json();
    username = String(body?.username ?? "");
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!username || !password) {
    return NextResponse.json({ error: "missing_credentials" }, { status: 400 });
  }

  let token = "";
  let hospital: unknown = null;
  try {
    const upstream = await fetch(`${API_BASE}/api/v1/hospital/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store"
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "invalid_login" }, { status: 401 });
    }
    const data = await upstream.json();
    token = String(data?.token ?? "");
    hospital = data?.hospital ?? null;
  } catch (err: any) {
    return NextResponse.json(
      { error: "upstream_failed", message: String(err?.message ?? err) },
      { status: 502 }
    );
  }
  if (!token) {
    return NextResponse.json({ error: "invalid_login" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, hospital });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return res;
}
