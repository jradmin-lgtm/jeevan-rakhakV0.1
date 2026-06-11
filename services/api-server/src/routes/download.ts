/**
 * download.ts — public APK download portal backend (the /get page calls these).
 *
 * Flow (gated; no anonymous downloads):
 *   POST /api/v1/dl/visit            -> log a page visit (best-effort)
 *   POST /api/v1/dl/:app  {contact}  -> validate mobile/email, log request, return one-time token
 *   GET  /api/v1/dl/:app/file?token= -> validate token, stream the latest APK via the Drive SA
 *   GET  /api/v1/admin/app-events    -> (admin-key) aggregates for the dashboard "App Installs" tab
 *
 * APK bytes are streamed through the server via the Drive SA (drive.ts); the
 * files stay private, so a server-issued token is required to download.
 */
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { sql } from "@jr/db";
import { driveConfigured, resolveLatestApk, openApkStream } from "../drive";

const APPS = new Set(["user", "driver"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?[0-9]{8,15}$/;

function clientIp(req: any): string {
  const fwd = req.headers["x-forwarded-for"];
  return (fwd ? fwd.toString().split(",")[0].trim() : req.ip) || "";
}
function validContact(raw: string): boolean {
  const c = raw.trim();
  return EMAIL_RE.test(c) || PHONE_RE.test(c.replace(/[\s-]/g, ""));
}

export async function registerDownloadRoutes(app: FastifyInstance) {
  // Page-visit log (fire-and-forget from /get on load)
  app.post("/api/v1/dl/visit", async (req: any) => {
    const a = typeof req.body?.app === "string" && APPS.has(req.body.app) ? req.body.app : null;
    try {
      await sql`INSERT INTO app_events (type, app, ip, user_agent)
                VALUES ('visit', ${a}, ${clientIp(req)}, ${(req.headers["user-agent"] ?? "").toString().slice(0, 400)})`;
    } catch {
      /* analytics is best-effort — never block the page */
    }
    return { ok: true };
  });

  // Portal feedback: visitor writes a message on the page, lands in admin App Installs.
  app.post("/api/v1/dl/feedback", async (req: any, reply) => {
    const message = (req.body?.message ?? "").toString().trim();
    const contact = (req.body?.contact ?? "").toString().trim();
    if (message.length < 5 || message.length > 2000) {
      return reply.code(400).send({ error: "invalid_message", message: "Please write a short message (at least a few words)." });
    }
    if (contact && !validContact(contact)) {
      return reply.code(400).send({ error: "invalid_contact", message: "Enter a valid mobile number or email, or leave it empty." });
    }
    await sql`INSERT INTO app_events (type, contact, message, ip, user_agent)
              VALUES ('feedback', ${contact || null}, ${message}, ${clientIp(req)}, ${(req.headers["user-agent"] ?? "").toString().slice(0, 400)})`;
    return { ok: true };
  });

  // Gate: capture contact, return a one-time download token
  app.post("/api/v1/dl/:app", async (req: any, reply) => {
    const appName = req.params.app;
    if (!APPS.has(appName)) return reply.code(404).send({ error: "unknown_app" });
    if (!driveConfigured()) return reply.code(503).send({ error: "downloads_unavailable" });
    const contact = (req.body?.contact ?? "").toString().trim();
    if (!validContact(contact)) {
      return reply.code(400).send({ error: "invalid_contact", message: "Enter a valid mobile number or email." });
    }
    const token = randomUUID();
    await sql`INSERT INTO app_events (type, app, contact, token, status, ip, user_agent)
              VALUES ('download', ${appName}, ${contact}, ${token}, 'requested', ${clientIp(req)}, ${(req.headers["user-agent"] ?? "").toString().slice(0, 400)})`;
    return { token };
  });

  // Stream the APK for a valid, unused, recent token
  app.get("/api/v1/dl/:app/file", async (req: any, reply) => {
    const appName = req.params.app;
    if (!APPS.has(appName)) return reply.code(404).send({ error: "unknown_app" });
    const token = (req.query?.token ?? "").toString();
    if (!token) return reply.code(403).send({ error: "token_required" });
    const [row] = await sql`
      SELECT id FROM app_events
      WHERE token = ${token} AND type = 'download' AND app = ${appName} AND status = 'requested'
        AND created_at > now() - interval '15 minutes'
      LIMIT 1`;
    if (!row) return reply.code(410).send({ error: "token_invalid_or_used", message: "Please request the download again." });
    const apk = await resolveLatestApk(appName as "user" | "driver");
    if (!apk) return reply.code(502).send({ error: "apk_unavailable" });
    const stream = await openApkStream(apk.id);
    if (!stream) return reply.code(502).send({ error: "apk_stream_failed" });
    await sql`UPDATE app_events SET status = 'downloaded', completed_at = now() WHERE id = ${row.id}`;
    reply.header("Content-Type", "application/vnd.android.package-archive");
    reply.header("Content-Disposition", `attachment; filename="${apk.name}"`);
    if (stream.contentLength) reply.header("Content-Length", stream.contentLength);
    return reply.send(stream.body);
  });

  // Admin analytics for the "App Installs" tab.
  // ?since=YYYY-MM-DD&until=YYYY-MM-DD (bare dates parsed as IST, same
  // semantics as routes/admin.ts pickDateRange). Unbounded when omitted.
  app.get("/api/v1/admin/app-events", { preHandler: (app as any).requireAdminKey }, async (req: any) => {
    const parse = (s: string | undefined, endOfDay: boolean): Date | null => {
      if (!s) return null;
      let raw = String(s).trim();
      if (!raw) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        raw = endOfDay ? `${raw}T23:59:59.999+05:30` : `${raw}T00:00:00.000+05:30`;
      }
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    };
    const since = parse(req.query?.since, false);
    const until = parse(req.query?.until, true);
    // postgres.js cannot serialize a JS Date in this casted-null-check shape
    // (Buffer.byteLength(Date) TypeError -> HTTP 500). Pass ISO strings instead.
    const sinceIso = since ? since.toISOString() : null;
    const untilIso = until ? until.toISOString() : null;

    const [visits] = await sql`
      SELECT count(*)::int AS n FROM app_events WHERE type = 'visit'
        AND (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
        AND (${untilIso}::timestamptz IS NULL OR created_at <= ${untilIso})`;
    const downloads = await sql`
      SELECT app, count(*)::int AS n FROM app_events
      WHERE type = 'download' AND status = 'downloaded'
        AND (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
        AND (${untilIso}::timestamptz IS NULL OR created_at <= ${untilIso})
      GROUP BY app`;
    const requested = await sql`
      SELECT app, count(*)::int AS n FROM app_events WHERE type = 'download'
        AND (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
        AND (${untilIso}::timestamptz IS NULL OR created_at <= ${untilIso})
      GROUP BY app`;
    const recent = await sql`
      SELECT app, contact, status, created_at, completed_at FROM app_events
      WHERE type = 'download'
        AND (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
        AND (${untilIso}::timestamptz IS NULL OR created_at <= ${untilIso})
      ORDER BY created_at DESC LIMIT 100`;
    // Funnel: did the captured contact later sign up? Match phone/email in users + drivers.
    const funnel = await sql`
      SELECT e.app,
             count(*)::int AS downloads,
             count(*) FILTER (WHERE u.id IS NOT NULL OR d.id IS NOT NULL)::int AS matched_signups
      FROM (SELECT DISTINCT app, contact FROM app_events WHERE type = 'download' AND contact IS NOT NULL
              AND (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
              AND (${untilIso}::timestamptz IS NULL OR created_at <= ${untilIso})) e
      LEFT JOIN users   u ON lower(u.email) = lower(e.contact) OR u.phone = e.contact
      LEFT JOIN drivers d ON lower(d.email) = lower(e.contact) OR d.phone = e.contact
      GROUP BY e.app`;
    const messages = await sql`
      SELECT contact, message, created_at FROM app_events
      WHERE type = 'feedback'
        AND (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
        AND (${untilIso}::timestamptz IS NULL OR created_at <= ${untilIso})
      ORDER BY created_at DESC LIMIT 100`;
    // Daily series (IST buckets) for the chart; unbounded range defaults to the last 31 days.
    const daily = await sql`
      SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day,
             count(*) FILTER (WHERE type = 'visit')::int AS visits,
             count(*) FILTER (WHERE type = 'download')::int AS requested,
             count(*) FILTER (WHERE type = 'download' AND status = 'downloaded')::int AS downloads,
             count(*) FILTER (WHERE type = 'feedback')::int AS messages
      FROM app_events
      WHERE (${sinceIso}::timestamptz IS NOT NULL OR created_at >= now() - interval '31 days')
        AND (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
        AND (${untilIso}::timestamptz IS NULL OR created_at <= ${untilIso})
      GROUP BY 1 ORDER BY 1`;
    // Full filtered event rows for the CSV dump (capped).
    const rows = await sql`
      SELECT type, app, contact, message, status, created_at, completed_at
      FROM app_events
      WHERE (${sinceIso}::timestamptz IS NULL OR created_at >= ${sinceIso})
        AND (${untilIso}::timestamptz IS NULL OR created_at <= ${untilIso})
      ORDER BY created_at DESC LIMIT 5000`;
    return { visits: visits?.n ?? 0, downloads, requested, recent, funnel, messages, daily, rows };
  });
}
