import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminSession } from "../../../lib/adminSession";

/**
 * Single shared-password gate for the admin dashboard.
 * - POST {password} → if it matches JR_ADMIN_PASSWORD, set HTTP-only cookie
 *   `jr-admin-session` containing a signed, expiring session (never the secret).
 * - DELETE → clear the cookie (logout).
 *
 * For pilot. When we onboard more than one admin, replace this with a real
 * per-account login + bcrypt hash + audit log.
 */

const ADMIN_PASSWORD = process.env.JR_ADMIN_PASSWORD ?? "dev-admin-pwd-change-in-prod";
const SESSION_COOKIE = "jr-admin-session";
const SESSION_SECRET = process.env.JR_ADMIN_SESSION_SECRET ?? "dev-session-secret-change-in-prod";
const SESSION_TTL_SEC = 60 * 60 * 8;

const attempts = new Map<string, { count: number; until: number }>();
export async function POST(req: NextRequest) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.startsWith("dev-") || SESSION_SECRET.startsWith("dev-")) return NextResponse.json({ error: "admin_login_not_configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const record = attempts.get(ip) ?? { count: 0, until: now + 15 * 60_000 };
  if (record.count >= 10) return NextResponse.json({ error: "too_many_login_attempts" }, { status: 429, headers: { "Retry-After": String(Math.ceil((record.until - now) / 1000)) } });
  if (attempts.size >= 1000 && !attempts.has(ip)) return NextResponse.json({ error: "login_busy_retry_later" }, { status: 429 });
  record.count += 1; attempts.set(ip, record);
  let password = "";
  try {
    const body = await req.json();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!password || Buffer.byteLength(password) !== Buffer.byteLength(ADMIN_PASSWORD) || !timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD))) {
    return NextResponse.json({ error: "invalid_password" }, { status: 401 });
  }
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createAdminSession(SESSION_SECRET), {
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
