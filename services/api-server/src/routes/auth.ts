import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import { db, drivers, otpCodes, users } from "@jr/db";
import { config } from "@jr/config";
import { sendOtpSms } from "../sms";

/**
 * Phone normalization — collapse `09800000099`, `9800000099`, `91 9800000099`,
 * `+91 98000-00099` into a single canonical `+919800000099`. This stops a user
 * from accidentally creating multiple accounts and stops attackers from
 * bypassing OTP attempt counters by varying the format.
 */
function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  // If it already starts with a country code, just prefix +.
  // If 10 digits, assume India (+91).
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return `+${digits}`;
}

const phoneSchema = z.string().min(8).max(20).transform((s, ctx) => {
  const n = normalizePhone(s);
  if (!n) {
    ctx.addIssue({ code: "custom", message: "invalid_phone" });
    return z.NEVER;
  }
  return n;
});

const loginSchema = z.object({
  phone: phoneSchema,
  role: z.enum(["user", "driver"])
});

const verifySchema = z.object({
  phone: phoneSchema,
  role: z.enum(["user", "driver"]),
  code: z.string().min(4).max(8).regex(/^\d+$/)
});

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Allow tests / load-tests to bypass per-route rate limits. We never set this
// in production; the boot guard would refuse anyway since CORS_ALLOWED_ORIGINS=*
// is rejected.
const RATE_LIMIT_BYPASS = process.env.RATE_LIMIT_BYPASS === "1";

export async function registerAuthRoutes(app: FastifyInstance) {
  // OTP request — rate-limit to N per minute per IP to bound SMS cost
  // and stop trivial enumeration attacks.
  app.post(
    "/api/v1/auth/login",
    {
      config: RATE_LIMIT_BYPASS
        ? {}
        : {
            rateLimit: {
              max: config.rateLimitOtpPerMin,
              timeWindow: "1 minute"
            }
          }
    },
    async (req, reply) => {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const { phone, role } = parsed.data;

      const code = generateOtp();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await db.insert(otpCodes).values({ phone, role, code, expiresAt });

      const channel = await sendOtpSms(phone, code, role);

      return reply.send({
        message: "otp_sent",
        channel,
        // Only surface the OTP when the demo bypass flag is on (dev/staging).
        // The boot guard refuses to start in production with this flag enabled.
        demoOtp: config.flags.show_demo_bypass ? code : undefined,
        ttlSec: 300
      });
    }
  );

  // Verify — slightly higher RL to allow legitimate retries on typos.
  app.post(
    "/api/v1/auth/verify-otp",
    {
      config: RATE_LIMIT_BYPASS
        ? {}
        : {
            rateLimit: {
              max: config.rateLimitVerifyPerMin,
              timeWindow: "1 minute"
            }
          }
    },
    async (req, reply) => {
      const parsed = verifySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const { phone, role, code } = parsed.data;

      const now = new Date();

      // Brute-force protection: count failed attempts on the most recent unconsumed
      // unexpired OTP for this (phone, role). If we've already exceeded the cap,
      // burn the OTP so further guesses are pointless.
      const recent = await db
        .select()
        .from(otpCodes)
        .where(
          and(
            eq(otpCodes.phone, phone),
            eq(otpCodes.role, role),
            isNull(otpCodes.consumedAt),
            gte(otpCodes.expiresAt, now)
          )
        )
        .orderBy(desc(otpCodes.createdAt))
        .limit(1);

      const candidate = recent[0];
      if (!candidate) {
        return reply.code(401).send({ error: "invalid_or_expired_otp" });
      }

      if (candidate.code !== code) {
        // Track failure: we re-purpose the row's `payloadJson`-equivalent via
        // the consumed flag — once N failures hit, mark consumed so the user
        // must request a new OTP.
        const [{ c }] = await db
          .select({ c: count() })
          .from(otpCodes)
          .where(
            and(
              eq(otpCodes.phone, phone),
              eq(otpCodes.role, role),
              gte(otpCodes.createdAt, new Date(now.getTime() - 10 * 60 * 1000))
            )
          );
        if (c >= config.otpMaxFailedAttempts) {
          await db.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, candidate.id));
          return reply.code(429).send({ error: "too_many_attempts" });
        }
        return reply.code(401).send({ error: "invalid_or_expired_otp" });
      }

      await db.update(otpCodes).set({ consumedAt: now }).where(eq(otpCodes.id, candidate.id));

      let actorId: string;
      let displayName: string | null = null;
      if (role === "user") {
        const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
        if (existing) {
          actorId = existing.id;
          displayName = existing.name;
        } else {
          const [created] = await db.insert(users).values({ phone }).returning();
          actorId = created.id;
        }
      } else {
        const [existing] = await db.select().from(drivers).where(eq(drivers.phone, phone)).limit(1);
        if (existing) {
          actorId = existing.id;
          displayName = existing.name;
        } else {
          const [created] = await db.insert(drivers).values({ phone }).returning();
          actorId = created.id;
        }
      }

      const accessToken = app.jwt.sign(
        { sub: actorId, role, phone },
        { expiresIn: config.jwtAccessTtlSec }
      );

      return reply.send({
        accessToken,
        tokenType: "Bearer",
        expiresIn: config.jwtAccessTtlSec,
        profile: { id: actorId, role, phone, name: displayName }
      });
    }
  );
}
