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
import { registerHospitalRoutes } from "./routes/hospital";
import { emitEvent } from "./events";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: {
      sub: string;
      role: "user" | "driver" | "admin" | "hospital";
      phone: string;
      hospitalId?: string;
    };
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

  // SECURITY GUARD-RAIL (v1.2.0): one secret (config.jwtSecret) now signs ALL
  // four roles — user, driver, admin AND hospital. `authenticate` only proves
  // the token is valid, NOT which role it carries. Every handler behind this
  // decorator MUST re-check `request.user.role` (and, for hospital tokens, that
  // `sub`/`hospitalId` matches the resource) before trusting the caller — a
  // hospital token must never satisfy a user/driver ownership check. Do not add
  // an `authenticate`-only route that acts on `sub` without a role check.
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

  app.decorate("requireHospital", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
      if (request.user?.role !== "hospital" || !request.user?.hospitalId) {
        return reply.code(403).send({ error: "hospital_only" });
      }
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });

  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerMeRoutes(app);
  await registerBookingRoutes(app);
  await registerDriverRoutes(app);
  await registerAdminRoutes(app);
  await registerHospitalRoutes(app);

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
    // Admin fare override — admin-only column, mobile apps never read it.
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_fare_override_inr  integer`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS admin_fare_override_note text`;
    // v1.0.11.5: human-readable booking number (6-digit sequential).
    // Sequence drives the default; column gets unique constraint so two
    // rows can never share a number. Existing rows (none — DB was wiped)
    // would need a backfill before adding NOT NULL.
    await pgClient`CREATE SEQUENCE IF NOT EXISTS jr_booking_display_seq START 100000 MINVALUE 100000`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS display_id text`;
    await pgClient`ALTER TABLE bookings ALTER COLUMN display_id SET DEFAULT nextval('jr_booking_display_seq')::text`;
    // Backfill any rows that pre-date the column. After DB wipe this is
    // a no-op; the UPDATE is here for resilience across re-deploys.
    await pgClient`UPDATE bookings SET display_id = nextval('jr_booking_display_seq')::text WHERE display_id IS NULL`;
    await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS bookings_display_id_uniq ON bookings(display_id)`;
    // v1.1.0: Google Sign-In identity columns. `email` becomes the canonical
    // login identifier; `auth_subject` is Google's stable `sub` claim used as
    // the lookup key on every sign-in (resilient to email-alias changes).
    // `auth_provider` records how the row was created ("google" for new rows;
    // null on any legacy OTP-only rows from before the DB wipe). All nullable
    // for backward compatibility with the OTP path during the rollout window.
    await pgClient`ALTER TABLE users   ADD COLUMN IF NOT EXISTS email          text`;
    await pgClient`ALTER TABLE users   ADD COLUMN IF NOT EXISTS auth_provider  text`;
    await pgClient`ALTER TABLE users   ADD COLUMN IF NOT EXISTS auth_subject   text`;
    await pgClient`ALTER TABLE users   ADD COLUMN IF NOT EXISTS picture_url    text`;
    await pgClient`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email          text`;
    await pgClient`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS auth_provider  text`;
    await pgClient`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS auth_subject   text`;
    await pgClient`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS picture_url    text`;
    // Uniqueness on `LOWER(email)` (Gmail addresses are case-insensitive in
    // practice — Google normalises before delivery). Partial index so the
    // legacy NULL-email rows don't collide.
    await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uniq   ON users(LOWER(email))   WHERE email IS NOT NULL`;
    await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS drivers_email_lower_uniq ON drivers(LOWER(email)) WHERE email IS NOT NULL`;
    // Same idea for the Google subject — it's the stable primary key Google
    // gives us. Lookup-by-sub is the hot path on every sign-in.
    await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS users_auth_subject_uniq   ON users(auth_subject)   WHERE auth_subject IS NOT NULL`;
    await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS drivers_auth_subject_uniq ON drivers(auth_subject) WHERE auth_subject IS NOT NULL`;
    // v1.0.15: SOS cascading dispatch + post-completion payment.
    // driver_heartbeats is the "last-known position" table — single row per
    // driver, upserted by /driver/heartbeat every 60s while the driver is
    // online + foregrounded. NOTE: distinct from the existing driver_locations
    // table which is an append-only trip-time GPS log (one row per ping during
    // an active ride). The cascade engine reads driver_heartbeats with a 5-min
    // staleness window to pick the nearest available drivers (Haversine, top
    // 10 by default).
    await pgClient`
      CREATE TABLE IF NOT EXISTS driver_heartbeats (
        driver_id  uuid PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
        lat        double precision NOT NULL,
        lng        double precision NOT NULL,
        updated_at timestamptz      NOT NULL DEFAULT now()
      )
    `;
    await pgClient`CREATE INDEX IF NOT EXISTS driver_heartbeats_updated_at_idx ON driver_heartbeats(updated_at)`;
    // sos_dispatch_attempts is the audit trail of every push the cascade
    // emitted. UNIQUE(booking_id, driver_id) prevents double-push if the
    // engine retries a wave. Insert on first emit; UPDATE the timestamps on
    // accept/reject.
    await pgClient`
      CREATE TABLE IF NOT EXISTS sos_dispatch_attempts (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        driver_id   uuid NOT NULL REFERENCES drivers(id)  ON DELETE CASCADE,
        wave_number integer NOT NULL,
        distance_km double precision,
        pushed_at   timestamptz NOT NULL DEFAULT now(),
        rejected_at timestamptz,
        accepted_at timestamptz
      )
    `;
    await pgClient`CREATE INDEX IF NOT EXISTS sos_attempts_booking_idx ON sos_dispatch_attempts(booking_id)`;
    await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS sos_attempts_booking_driver_uniq ON sos_dispatch_attempts(booking_id, driver_id)`;
    // SOS marker — replaces the brittle "pickupAddress starts with SOS · "
    // convention with a real column the cascade engine + /complete handler
    // can read. NOT NULL with a default false so backfill is automatic.
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_sos boolean NOT NULL DEFAULT false`;
    // Post-completion payment: SOS rides show a payment screen at the end
    // (coupon + ₹0 in pilot). Normal flow auto-marks paid at /complete since
    // the patient saw the fare upfront. `paid_at IS NULL` is the derived
    // "awaiting payment" state — no new status column needed.
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_inr    integer`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at     timestamptz`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_coupon text`;
    // Backfill completed rows so existing pilot bookings (mostly already at
    // ₹0 via PILOT100) don't reappear as "awaiting payment" in ride history.
    // Uses `completed_at` when present, otherwise `created_at` — `bookings`
    // doesn't carry a generic `updated_at` (only the per-state timestamps).
    await pgClient`
      UPDATE bookings
         SET paid_at = COALESCE(completed_at, created_at),
             paid_inr = 0
       WHERE status = 'COMPLETED' AND paid_at IS NULL
    `;
    // v1.1.0 (CR#3/#6): destination hospitals. One active default
    // (SRMS IMS, Bareilly) is auto-assigned at PICKED_UP; schema supports
    // onboarding more later via the admin /hospitals CRUD. The seed coords
    // are the Bhojipura / Nainital Road anchor (SRMS sits on that road) —
    // APPROXIMATE, pending exact-pin confirmation from ops via admin edit.
    await pgClient`
      CREATE TABLE IF NOT EXISTS hospitals (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name       text NOT NULL,
        lat        double precision NOT NULL,
        lng        double precision NOT NULL,
        address    text,
        city       text,
        phone      text,
        active     boolean NOT NULL DEFAULT true,
        is_default boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `;
    await pgClient`CREATE INDEX IF NOT EXISTS hospitals_active_idx ON hospitals(active)`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dest_hospital_id uuid REFERENCES hospitals(id) ON DELETE SET NULL`;
    // Idempotent seed — only inserts the default if none exists yet, so an
    // ops edit to the coords/name survives every redeploy.
    await pgClient`
      INSERT INTO hospitals (name, lat, lng, address, city, is_default, active)
      SELECT 'SRMS IMS Hospital, Bareilly', 28.4875, 79.4452,
             'Nainital Road, Bhojipura, Bareilly', 'Bareilly', true, true
      WHERE NOT EXISTS (SELECT 1 FROM hospitals WHERE is_default = true)
    `;
    // v1.1.0 push: FCM device tokens for background/killed-app notifications.
    await pgClient`ALTER TABLE users   ADD COLUMN IF NOT EXISTS push_token text`;
    await pgClient`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS push_token text`;
    // v1.1.2: driver↔hospital many-to-many assignment (admin-managed).
    await pgClient`
      CREATE TABLE IF NOT EXISTS driver_hospitals (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        driver_id   uuid NOT NULL REFERENCES drivers(id)   ON DELETE CASCADE,
        hospital_id uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
        is_primary  boolean NOT NULL DEFAULT false,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    await pgClient`CREATE INDEX  IF NOT EXISTS driver_hospitals_driver_idx   ON driver_hospitals(driver_id)`;
    await pgClient`CREATE INDEX  IF NOT EXISTS driver_hospitals_hospital_idx ON driver_hospitals(hospital_id)`;
    await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS driver_hospitals_uniq   ON driver_hospitals(driver_id, hospital_id)`;
    // Backfill: seed an assignment row from each driver's existing single
    // hospitalId (set at KYC) so the new model honours current data.
    await pgClient`
      INSERT INTO driver_hospitals (driver_id, hospital_id, is_primary)
      SELECT d.id, d.hospital_id::uuid, true
      FROM drivers d
      WHERE d.hospital_id IS NOT NULL
        AND d.hospital_id ~ '^[0-9a-f-]{36}$'
        AND EXISTS (SELECT 1 FROM hospitals h WHERE h.id = d.hospital_id::uuid)
        AND NOT EXISTS (SELECT 1 FROM driver_hospitals dh WHERE dh.driver_id = d.id)
    `;
    // ---- v1.2.0 ----
    // CR#2: driver cancellation audit log.
    await pgClient`
      CREATE TABLE IF NOT EXISTS booking_cancellations (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        driver_id   uuid REFERENCES drivers(id) ON DELETE SET NULL,
        reason_code text NOT NULL,
        remarks     text,
        outcome     text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `;
    await pgClient`CREATE INDEX IF NOT EXISTS booking_cancellations_driver_idx  ON booking_cancellations(driver_id)`;
    await pgClient`CREATE INDEX IF NOT EXISTS booking_cancellations_booking_idx ON booking_cancellations(booking_id)`;
    await pgClient`CREATE INDEX IF NOT EXISTS booking_cancellations_created_at_idx ON booking_cancellations(created_at DESC)`;
    // CR#2: server-side wait-clock anchor for patient-reason cancellations.
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_wait_started_at timestamptz`;
    // CR#3: hospital portal credentials (one login per hospital for pilot).
    await pgClient`ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS portal_username      text`;
    await pgClient`ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS portal_password_hash text`;
    await pgClient`ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS portal_enabled       boolean NOT NULL DEFAULT false`;
    await pgClient`CREATE UNIQUE INDEX IF NOT EXISTS hospitals_portal_username_uniq ON hospitals(LOWER(portal_username)) WHERE portal_username IS NOT NULL`;
    // CR#3: hospital "acknowledge — preparing" loop-closer.
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hospital_ack_at   timestamptz`;
    await pgClient`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hospital_ack_note text`;
    app.log.info("[migrate] schema v1.2.0 ready (booking_cancellations + cancel_wait + hospital portal creds + hospital_ack)");
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
  // v1.0.15: resume any SOS cascade that was mid-flight when this process
  // last died. Best-effort — if it fails, the booking stays REQUESTED and
  // ops can intervene via admin. Run AFTER listen so we don't block boot.
  try {
    const { resumeOnBoot } = await import("./sos-cascade.js");
    void resumeOnBoot(app);
  } catch (err) {
    app.log.warn({ err }, "[sos] resumeOnBoot import failed");
  }
}

bootstrap().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
