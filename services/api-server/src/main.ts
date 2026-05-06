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

  app.setErrorHandler((err: any, _req, reply) => {
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
    return reply.code(500).send({ error: "internal_error" });
  });

  await app.listen({ host: "0.0.0.0", port: config.apiPort });
  app.log.info(`api-server listening on :${config.apiPort}`);
}

bootstrap().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
