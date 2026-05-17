import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { config } from "@jr/config";
import { sql as pgClient } from "@jr/db";
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

  // Idempotent auto-migration so observability + per-ride OTP work on a
  // fresh Neon DB without an out-of-band step. Uses the raw postgres
  // client (pgClient) — earlier attempt used drizzle's `db.execute(sql\`…\`)`
  // through a dynamic import and silently failed with "Cannot read
  // properties of undefined (reading 'execute')" on the compiled JS path.
  try {
    await pgClient`
      CREATE TABLE IF NOT EXISTS system_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ts timestamptz NOT NULL DEFAULT now(),
        level text NOT NULL,
        source text NOT NULL,
        message text NOT NULL,
        context jsonb,
        notified boolean NOT NULL DEFAULT false
      )
    `;
    await pgClient`CREATE INDEX IF NOT EXISTS system_events_ts_idx ON system_events(ts DESC)`;
    await pgClient`CREATE INDEX IF NOT EXISTS system_events_level_idx ON system_events(level)`;
    // Per-ride OTP (4 digits) for the driver's PICKUP verification step.
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS ride_otp_code text`;
    // Admin-set disable flag for users and drivers — gates /auth/verify-otp.
    await pgClient`ALTER TABLE users   ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false`;
    await pgClient`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false`;
    // Coupon + discount + payable. Captured at booking creation, recomputed
    // at /complete. Lets admin show fare breakdown that matches the user app.
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS coupon_code  text`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_inr integer NOT NULL DEFAULT 0`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payable_inr  integer`;
    // v1.0.11: patient details + paramedic assessment + driver KYC fields.
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_name         text`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_age          integer`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_gender       text`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_condition    text`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS patient_notes        text`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paramedic_assessment jsonb`;
    await pgClient`ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS photo_url        text`;
    await pgClient`ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS rc_number        text`;
    await pgClient`ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS insurance_number text`;
    await pgClient`ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS hospital_id      text`;
    await pgClient`ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS hospital_name    text`;
    // v1.0.11.3: two-way ratings + feedback. Users + drivers each carry an
    // average rating (default 5.0) + rating count; bookings carry both
    // directions of the rate.
    await pgClient`ALTER TABLE users    ADD COLUMN IF NOT EXISTS rating       double precision NOT NULL DEFAULT 5.0`;
    await pgClient`ALTER TABLE users    ADD COLUMN IF NOT EXISTS rating_count integer          NOT NULL DEFAULT 0`;
    await pgClient`ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS rating_count integer          NOT NULL DEFAULT 0`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rating_by_driver   integer`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS feedback_by_driver text`;
    app.log.info("[migrate] schema v1.0.11.3 ready (two-way ratings + feedback)");
  } catch (err) {
    // Thumb rule: migrations FATAL-EXIT on failure. Silent catch+warn here
    // previously let the service start with a broken schema (system_events
    // missing, ride_otp_code missing) and every booking POST 500'd. Loud
    // failure surfaces the issue immediately in Render's deploy logs and
    // holds the deploy open ("live" stays on the previous good build).
    // eslint-disable-next-line no-console
    console.error("[migrate] DDL failed — refusing to start with a broken schema:");
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
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
  // Uses the raw postgres client so the migrate/cleanup path stays consistent
  // and doesn't rely on the drizzle dynamic-import that broke before.
  setInterval(async () => {
    try {
      await pgClient`DELETE FROM system_events WHERE ts < NOW() - INTERVAL '7 days'`;
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
