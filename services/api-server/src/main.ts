import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { config } from "@jr/config";
import { registerHealthRoutes } from "./routes/health";
import { registerAuthRoutes } from "./routes/auth";
import { registerMeRoutes } from "./routes/me";
import { registerBookingRoutes } from "./routes/bookings";
import { registerDriverRoutes } from "./routes/drivers";
import { registerAdminRoutes } from "./routes/admin";
import { emitEvent } from "./events";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { sub: string; role: "user" | "driver" | "admin"; phone: string };
  }
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? "info" },
  bodyLimit: 256 * 1024,
  trustProxy: true
});

/**
 * Boot-time hardening — refuse to start in production with insecure defaults.
 */
function assertProductionReady() {
  if (config.env !== "production") return;
  const problems: string[] = [];
  if (config.jwtSecret.startsWith("dev-secret"))    problems.push("JWT_SECRET is still the dev default");
  if (config.internalApiSecret.startsWith("dev-"))  problems.push("INTERNAL_API_SECRET is still the dev default");
  if (config.adminApiKey.startsWith("dev-"))        problems.push("ADMIN_API_KEY is still the dev default");
  if (config.flags.show_demo_bypass)                problems.push("FLAG_DEMO_BYPASS=true must be disabled in production (would expose OTP codes in responses)");
  if (config.flags.pilot_bypass_otp)                problems.push("FLAG_PILOT_BYPASS_OTP=true must be disabled in production (pilot-only: makes OTP guessable as last 4 digits of phone)");
  if (config.corsAllowedOrigins === "*")            problems.push("CORS_ALLOWED_ORIGINS=* is unsafe in production — set to a comma-separated allowlist");
  if (problems.length > 0) {
    console.error("[startup] refusing to boot in production:");
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }
}

async function bootstrap() {
  assertProductionReady();

  const allowedOrigins = config.corsAllowedOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin:
      allowedOrigins.length === 0 || allowedOrigins.includes("*")
        ? true
        : allowedOrigins,
    credentials: false
  });

  await app.register(jwt, { secret: config.jwtSecret });

  await app.register(rateLimit, {
    global: false,
    max: config.rateLimitGenericPerMin,
    timeWindow: "1 minute",
    keyGenerator: (req) => (req.ip ?? "unknown")
  });

  app.decorate("authenticate", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.decorate("requireAdminKey", async function (request: any, reply: any) {
    const sent = String(request.headers["x-admin-key"] ?? "");
    if (!sent || sent !== config.adminApiKey) {
      return reply.code(401).send({ error: "admin_key_required" });
    }
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerBookingRoutes(app);
  await registerDriverRoutes(app);
  await registerAdminRoutes(app);

  // Idempotent auto-migration of the system_events table so the obs stack
  // works on a fresh Neon DB without an out-of-band step. Cheap (~5ms when
  // table already exists) and safe — every CREATE has IF NOT EXISTS.
  try {
    const { db } = await import("@jr/db");
    const { sql } = await import("drizzle-orm");
    await (db as any).execute(sql`
      CREATE TABLE IF NOT EXISTS system_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ts timestamptz NOT NULL DEFAULT now(),
        level text NOT NULL,
        source text NOT NULL,
        message text NOT NULL,
        context jsonb,
        notified boolean NOT NULL DEFAULT false
      )
    `);
    await (db as any).execute(sql`CREATE INDEX IF NOT EXISTS system_events_ts_idx ON system_events(ts DESC)`);
    await (db as any).execute(sql`CREATE INDEX IF NOT EXISTS system_events_level_idx ON system_events(level)`);
    app.log.info("[migrate] system_events ready");
  } catch (err) {
    app.log.warn({ err }, "[migrate] system_events DDL failed — alerts won't have data yet");
  }

  app.setErrorHandler((err: any, req, reply) => {
    // Respect status codes set by Fastify plugins (rate-limit → 429, JWT → 401, etc.)
    if (err?.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply
        .code(err.statusCode)
        .send({ error: err.code ?? "request_failed", message: err.message });
    }
    app.log.error(err);
    if (err?.validation) {
      return reply.code(400).send({ error: "bad_request", details: err.message });
    }
    // Unhandled 5xx — record + alert. Fire-and-forget; never block the response.
    void emitEvent({
      level: "error",
      source: "api",
      message: err?.message ?? "internal_error",
      context: {
        path: (req as any).routerPath ?? req.url,
        method: req.method,
        stack: String(err?.stack ?? "").slice(0, 2000)
      }
    });
    return reply.code(500).send({ error: "internal_error" });
  });

  // Daily cleanup of events older than 7 days. Runs every 6h via setInterval.
  // Cheap (~ms) and idempotent; keeps Neon row count bounded.
  setInterval(async () => {
    try {
      const { db } = await import("@jr/db");
      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      // Raw SQL avoids cross-version drizzle type friction.
      await (db as any).execute(
        (await import("drizzle-orm")).sql`DELETE FROM system_events WHERE ts < ${sevenDaysAgoIso}::timestamptz`
      );
    } catch (err) {
      app.log.warn({ err }, "[events] cleanup failed");
    }
  }, 6 * 60 * 60 * 1000);

  await app.listen({ host: "0.0.0.0", port: config.apiPort });
  app.log.info(`api-server listening on :${config.apiPort}`);
  // Mark a clean boot in the timeline.
  void emitEvent({
    level: "info",
    source: "api",
    message: "api-server started",
    context: { port: config.apiPort, env: config.env }
  });
}

bootstrap().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
