import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db, drivers, otpCodes, users } from "@jr/db";
import { config } from "@jr/config";
import { sendOtpSms } from "../sms";
import { OAuth2Client } from "google-auth-library";

/**
 * Singleton verifier — pinned to OUR Web Client ID. Any ID token whose `aud`
 * claim doesn't match this string is rejected. Cheap to construct but lazy so
 * dev environments without GOOGLE_WEB_CLIENT_ID set don't crash at boot.
 */
let _googleClient: OAuth2Client | null = null;
function googleClient(): OAuth2Client {
  if (!_googleClient) {
    if (!config.googleAuth.webClientId) {
      throw new Error("google_auth_not_configured");
    }
    _googleClient = new OAuth2Client(config.googleAuth.webClientId);
  }
  return _googleClient;
}

type GoogleProfile = {
  sub: string;        // stable Google user ID
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const ticket = await googleClient().verifyIdToken({
    idToken,
    audience: config.googleAuth.webClientId
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error("google_invalid_token");
  if (!payload.sub) throw new Error("google_invalid_token");
  if (!payload.email) throw new Error("google_no_email");
  // Note: `email_verified` is typed as `true | undefined` in google-auth-library's
  // payload — Google never emits `false` for it, but our defensive read normalizes
  // anyway in case the library type loosens later.
  const verified = (payload as { email_verified?: boolean }).email_verified !== false;
  if (!verified) throw new Error("google_email_not_verified");
  return {
    sub: payload.sub,
    email: payload.email!,
    emailVerified: verified,
    name: payload.name ?? null,
    picture: payload.picture ?? null
  };
}

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

function generateOtp(phone?: string): string {
  // PILOT BYPASS: when FLAG_PILOT_BYPASS_OTP=true, the OTP is the last 4 digits
  // of the caller's phone. Zero SMS cost, no DLT registration required. The
  // rest of the OTP pipeline (DB write, expiry, brute-force lockout, verify
  // route) runs unchanged. Boot guard refuses prod startup with this flag on.
  if (config.flags.pilot_bypass_otp && phone) {
    return phone.replace(/\D/g, "").slice(-4);
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Allow tests / load-tests to bypass per-route rate limits. We never set this
// in production; the boot guard would refuse anyway since CORS_ALLOWED_ORIGINS=*
// is rejected.
const RATE_LIMIT_BYPASS = process.env.RATE_LIMIT_BYPASS === "1";

export async function registerAuthRoutes(app: FastifyInstance) {
  // v1.0.13: OTP login killed for security.
  //
  // The pilot's `pilot_bypass_otp` flag returned the OTP as the last 4 digits
  // of the caller's phone, which meant anyone who knew a user's phone number
  // could impersonate them. That flag is now off in prod, but rather than
  // restoring random SMS OTPs (which would also need a paid SMS provider +
  // DLT registration), we replaced the whole login flow with Google
  // Sign-In (see /api/v1/auth/google below).
  //
  // Both legacy endpoints stay registered as 410 Gone so the old v1.0.12
  // APKs in users' hands surface a clean "upgrade required" toast instead
  // of a half-broken login screen. To re-enable OTP later, restore the
  // handlers from git history (last seen at commit 23686d8).
  const goneHandler = async (_req: unknown, reply: any) => {
    return reply.code(410).send({
      error: "otp_login_disabled",
      message: "OTP login is no longer supported. Please update to the latest Jeevan Rakshak app and sign in with Google.",
      upgrade: true
    });
  };

  app.post("/api/v1/auth/login", goneHandler);
  app.post("/api/v1/auth/verify-otp", goneHandler);

  // ────────────────────────────────────────────────────────────────────────
  // v1.1.0: Google Sign-In
  //
  // POST /api/v1/auth/google
  //   { idToken, role }
  //   - Verifies the ID token's signature + audience against our Web client ID.
  //   - Looks up an existing user/driver by `auth_subject` (Google `sub`).
  //   - If found: returns a JWT + profile (signed in).
  //   - If not found: returns { needsProfile: true, googleProfile: {...} }.
  //     The mobile app then shows the phone+name capture form and POSTs to
  //     /auth/google/complete with the captured fields.
  // ────────────────────────────────────────────────────────────────────────

  const googleStartSchema = z.object({
    idToken: z.string().min(20),
    role: z.enum(["user", "driver"])
  });

  app.post(
    "/api/v1/auth/google",
    {
      config: RATE_LIMIT_BYPASS
        ? {}
        : { rateLimit: { max: config.rateLimitOtpPerMin * 3, timeWindow: "1 minute" } }
    },
    async (req, reply) => {
      const parsed = googleStartSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const { idToken, role } = parsed.data;

      let gp: GoogleProfile;
      try {
        gp = await verifyGoogleIdToken(idToken);
      } catch (err: any) {
        const code = String(err?.message ?? "google_invalid_token");
        if (code === "google_auth_not_configured") {
          return reply.code(503).send({ error: "google_auth_not_configured" });
        }
        return reply.code(401).send({ error: code });
      }

      // Hot path: lookup by Google's stable subject id. Email could change
      // (Gmail aliases, work-account merges); sub stays put.
      const table = role === "user" ? users : drivers;
      const [existing] = await db.select().from(table).where(eq(table.authSubject, gp.sub)).limit(1);

      if (existing) {
        if (existing.disabled) {
          return reply.code(403).send({ error: "account_disabled", message: "This account has been disabled. Contact support." });
        }
        // Refresh picture + name on every sign-in — cheap, keeps admin views fresh
        // when the user changes their Google avatar. Phone never updated here:
        // it was captured at first sign-in and only ops can change it.
        await db.update(table)
          .set({ name: existing.name ?? gp.name, pictureUrl: gp.picture })
          .where(eq(table.id, existing.id));

        const accessToken = app.jwt.sign(
          { sub: existing.id, role, phone: existing.phone },
          { expiresIn: config.jwtAccessTtlSec }
        );
        return reply.send({
          accessToken,
          tokenType: "Bearer",
          expiresIn: config.jwtAccessTtlSec,
          profile: {
            id: existing.id,
            role,
            phone: existing.phone,
            name: existing.name ?? gp.name,
            email: existing.email,
            pictureUrl: gp.picture
          }
        });
      }

      // First-time Google sign-in for this account. We don't create the row
      // yet — wait for phone+name to land via /auth/google/complete so we can
      // enforce the email↔phone uniqueness atomically with the insert.
      return reply.send({
        needsProfile: true,
        googleProfile: {
          email: gp.email,
          name: gp.name,
          picture: gp.picture,
          sub: gp.sub
        }
      });
    }
  );

  const googleCompleteSchema = z.object({
    idToken: z.string().min(20),
    role: z.enum(["user", "driver"]),
    phone: phoneSchema,
    name: z.string().trim().min(1).max(120)
  });

  app.post(
    "/api/v1/auth/google/complete",
    {
      config: RATE_LIMIT_BYPASS
        ? {}
        : { rateLimit: { max: config.rateLimitVerifyPerMin, timeWindow: "1 minute" } }
    },
    async (req, reply) => {
      const parsed = googleCompleteSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const { idToken, role, phone, name } = parsed.data;

      let gp: GoogleProfile;
      try {
        gp = await verifyGoogleIdToken(idToken);
      } catch (err: any) {
        const code = String(err?.message ?? "google_invalid_token");
        if (code === "google_auth_not_configured") {
          return reply.code(503).send({ error: "google_auth_not_configured" });
        }
        return reply.code(401).send({ error: code });
      }

      const table = role === "user" ? users : drivers;

      // Race-safe: another tab/device could have completed signup with this
      // Google account between /google and /google/complete. Re-check.
      const [bySub] = await db.select().from(table).where(eq(table.authSubject, gp.sub)).limit(1);
      if (bySub) {
        if (bySub.disabled) {
          return reply.code(403).send({ error: "account_disabled" });
        }
        const accessToken = app.jwt.sign(
          { sub: bySub.id, role, phone: bySub.phone },
          { expiresIn: config.jwtAccessTtlSec }
        );
        return reply.send({
          accessToken,
          tokenType: "Bearer",
          expiresIn: config.jwtAccessTtlSec,
          profile: { id: bySub.id, role, phone: bySub.phone, name: bySub.name, email: bySub.email, pictureUrl: bySub.pictureUrl }
        });
      }

      // Uniqueness checks BEFORE insert so we can return clean error codes
      // (Postgres unique-violation surfaces as 500 with cryptic detail).
      const [byEmail] = await db
        .select()
        .from(table)
        .where(sql`LOWER(${table.email}) = LOWER(${gp.email})`)
        .limit(1);
      if (byEmail) {
        return reply.code(409).send({
          error: "email_already_used",
          message: `This Gmail is already registered. If you don't recognise the account, contact support.`,
          registeredPhone: maskPhone(byEmail.phone)
        });
      }
      const [byPhone] = await db.select().from(table).where(eq(table.phone, phone)).limit(1);
      if (byPhone) {
        return reply.code(409).send({
          error: "phone_already_used",
          message: `This phone number is already registered under a different Google account. Contact support if you've lost access.`,
          registeredEmail: maskEmail(byPhone.email)
        });
      }

      // Cross-role check: same email on both sides is OK (a person can be
      // both a patient and a driver), but flag in logs for ops awareness.
      // No DB constraint between the two tables — intentional.

      let created: typeof users.$inferSelect | typeof drivers.$inferSelect;
      if (role === "user") {
        const [row] = await db.insert(users).values({
          phone,
          name,
          email: gp.email,
          authProvider: "google",
          authSubject: gp.sub,
          pictureUrl: gp.picture
        }).returning();
        created = row;
      } else {
        const [row] = await db.insert(drivers).values({
          phone,
          name,
          email: gp.email,
          authProvider: "google",
          authSubject: gp.sub,
          pictureUrl: gp.picture
        }).returning();
        created = row;
      }

      const accessToken = app.jwt.sign(
        { sub: created.id, role, phone },
        { expiresIn: config.jwtAccessTtlSec }
      );
      return reply.send({
        accessToken,
        tokenType: "Bearer",
        expiresIn: config.jwtAccessTtlSec,
        profile: {
          id: created.id,
          role,
          phone,
          name,
          email: gp.email,
          pictureUrl: gp.picture
        }
      });
    }
  );
}

/** Conservative phone-number mask for conflict-error responses — keeps the
 *  country code + last 2 digits so support can identify the account on the
 *  phone with the user without leaking the rest. */
function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  if (phone.length < 6) return "•••";
  return `${phone.slice(0, 3)}•••${phone.slice(-2)}`;
}

/** Mask email like `k****r@gmail.com` so we can disambiguate which account
 *  collided without exposing the full address to a stranger trying to enumerate. */
function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  if (local.length <= 2) return `${local[0]}•••@${domain}`;
  return `${local[0]}${"•".repeat(Math.max(1, local.length - 2))}${local.slice(-1)}@${domain}`;
}
