/**
 * Wrapper around `fetch` for admin-web data calls.
 *
 * v1.0.11.4 rewrite — the admin API key is no longer in the browser bundle.
 *
 *   - Server-side (RSC pages, route handlers, middleware): forwards
 *     directly to the api-server with `x-admin-key` from the server-only
 *     env var ADMIN_API_KEY. The browser never sees this code path.
 *   - Client-side (anything inside "use client"): rewrites the call to
 *     the same-origin /api/proxy/<path>, which runs on Vercel server
 *     and attaches the same key. The client just sends its session
 *     cookie; the key never leaves the server.
 *
 * Single helper, both contexts, no caller changes. Fixes audit finding
 * #1 (NEXT_PUBLIC_ADMIN_API_KEY extractable from /_next/static/*.js).
 */

const isServer = typeof window === "undefined";
const API_BASE =
  process.env.JR_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:4000";

// Server-only — never read this on the client (the bundler would not
// substitute a value without NEXT_PUBLIC_ anyway, so this is doubly safe).
const SERVER_ADMIN_KEY = isServer
  ? (process.env.ADMIN_API_KEY ?? "dev-admin-key-change-in-prod")
  : "";

export function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (isServer) {
    // Direct call to the api-server with the real admin key.
    const target = /^https?:\/\//.test(url) ? url : `${API_BASE}${url}`;
    const headers = new Headers(init.headers ?? {});
    headers.set("x-admin-key", SERVER_ADMIN_KEY);
    return fetch(target, { ...init, headers, cache: "no-store" });
  }

  // Client path: rewrite to same-origin proxy. The proxy's middleware
  // requires a valid session cookie or returns 401.
  let target = url;
  if (/^https?:\/\//.test(url)) {
    const u = new URL(url);
    target = `/api/proxy${u.pathname}${u.search}`;
  } else if (!url.startsWith("/api/proxy") && url.startsWith("/api/")) {
    target = `/api/proxy${url}`;
  }
  return fetch(target, { ...init, cache: "no-store" });
}
