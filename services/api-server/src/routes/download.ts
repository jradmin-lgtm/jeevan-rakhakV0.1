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

  // Admin analytics for the "App Installs" tab
  app.get("/api/v1/admin/app-events", { preHandler: (app as any).requireAdminKey }, async () => {
    const [visits] = await sql`SELECT count(*)::int AS n FROM app_events WHERE type = 'visit'`;
    const downloads = await sql`
      SELECT app, count(*)::int AS n FROM app_events
      WHERE type = 'download' AND status = 'downloaded' GROUP BY app`;
    const requested = await sql`
      SELECT app, count(*)::int AS n FROM app_events WHERE type = 'download' GROUP BY app`;
    const recent = await sql`
      SELECT app, contact, status, created_at, completed_at FROM app_events
      WHERE type = 'download' ORDER BY created_at DESC LIMIT 100`;
    // Funnel: did the captured contact later sign up? Match phone/email in users + drivers.
    const funnel = await sql`
      SELECT e.app,
             count(*)::int AS downloads,
             count(*) FILTER (WHERE u.id IS NOT NULL OR d.id IS NOT NULL)::int AS matched_signups
      FROM (SELECT DISTINCT app, contact FROM app_events WHERE type = 'download' AND contact IS NOT NULL) e
      LEFT JOIN users   u ON lower(u.email) = lower(e.contact) OR u.phone = e.contact
      LEFT JOIN drivers d ON lower(d.email) = lower(e.contact) OR d.phone = e.contact
      GROUP BY e.app`;
    return { visits: visits?.n ?? 0, downloads, requested, recent, funnel };
  });
}
