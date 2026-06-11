import { NextRequest, NextResponse } from "next/server";

/**
 * PUBLIC proxy for the download portal (the /get page). Forwards the two small
 * POSTs to the api-server's public /api/v1/dl/* endpoints (no admin key, no
 * session) — this keeps the calls same-origin (no CORS) and never exposes the
 * api base in the client bundle.
 *
 *   POST /api/dl/visit          -> api-server POST /api/v1/dl/visit
 *   POST /api/dl/{user|driver}  -> api-server POST /api/v1/dl/{app}; on success
 *                                  we append `fileUrl` (the direct api-server
 *                                  download link) so the page can navigate to it.
 *
 * The 60 MB APK itself is downloaded by the browser navigating straight to the
 * api-server `fileUrl` (a GET with Content-Disposition) — it never streams
 * through this Vercel function.
 */
const API_BASE =
  process.env.JR_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const ALLOWED = new Set(["visit", "user", "driver", "feedback"]);

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const seg = (path?.[0] ?? "").toLowerCase();
  if (!ALLOWED.has(seg) || (path?.length ?? 0) !== 1) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const headers: Record<string, string> = {};
  const ct = req.headers.get("content-type");
  if (ct) headers["content-type"] = ct;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers["x-forwarded-for"] = xff; // so the api-server logs the real client IP
  const ua = req.headers.get("user-agent");
  if (ua) headers["user-agent"] = ua; // and the real device/browser, not this proxy's fetch UA

  try {
    const res = await fetch(`${API_BASE}/api/v1/dl/${seg}`, {
      method: "POST",
      headers,
      body: await req.text(),
      cache: "no-store",
    });
    const text = await res.text();

    if ((seg === "user" || seg === "driver") && res.ok) {
      try {
        const j = JSON.parse(text);
        if (j?.token) {
          return NextResponse.json(
            { token: j.token, fileUrl: `${API_BASE}/api/v1/dl/${seg}/file?token=${encodeURIComponent(j.token)}` },
            { status: res.status }
          );
        }
      } catch {
        /* fall through to passthrough */
      }
    }

    const out = new NextResponse(text, { status: res.status });
    const rct = res.headers.get("content-type");
    if (rct) out.headers.set("content-type", rct);
    return out;
  } catch (err: any) {
    return NextResponse.json({ error: "upstream_failed", message: String(err?.message ?? err) }, { status: 502 });
  }
}

export const POST = handle;
