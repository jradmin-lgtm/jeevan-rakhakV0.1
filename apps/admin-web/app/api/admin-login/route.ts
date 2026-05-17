import { NextRequest, NextResponse } from "next/server";

/**
 * Single shared-password gate for the admin dashboard.
 * - POST {password} → if it matches JR_ADMIN_PASSWORD, set HTTP-only cookie
 *   `jr-admin-session` containing JR_ADMIN_SESSION_SECRET (NOT the password).
 * - DELETE → clear the cookie (logout).
 *
 * For pilot. When we onboard more than one admin, replace this with a real
 * per-account login + bcrypt hash + audit log.
 */

const ADMIN_PASSWORD = process.env.JR_ADMIN_PASSWORD ?? "dev-admin-pwd-change-in-prod";
const SESSION_COOKIE = "jr-admin-session";
const SESSION_SECRET = process.env.JR_ADMIN_SESSION_SECRET ?? "dev-session-secret-change-in-prod";
const SESSION_TTL_SEC = 60 * 60 * 8;

export async function POST(req: NextRequest) {
  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!password || password !== ADMIN_PASSWORD) {
    // No timing-attack hardening here for the pilot — single password,
    // single attempt rate-limited at the network level.
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, SESSION_SECRET, {
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
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
