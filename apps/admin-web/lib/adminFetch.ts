/**
 * Wrapper around `fetch` that always sends the admin API key.
 *
 * The key is read from `NEXT_PUBLIC_ADMIN_API_KEY` (build-time inlined). For
 * production, the team should additionally:
 *   - put the admin domain behind an IP allowlist or VPN, and
 *   - rotate the key on a schedule.
 *
 * Returning a 401 means the key was wrong — usually a deploy mismatch between
 * the api-server's `ADMIN_API_KEY` and the admin-web's `NEXT_PUBLIC_ADMIN_API_KEY`.
 */
const ADMIN_KEY =
  process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? "dev-admin-key-change-in-prod";

export function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set("x-admin-key", ADMIN_KEY);
  return fetch(url, { ...init, headers, cache: "no-store" });
}
