/**
 * @jr/config — central env + feature flag registry.
 *
 * The team only needs to fill in placeholder values in `.env` (or in your hosting
 * platform's secret manager). Each provider is gated by a `*_PROVIDER` flag, so
 * the system runs end-to-end with `mock` providers (no external accounts) and
 * flips to real providers when keys are added.
 *
 * Required for production:
 *   - JWT_SECRET                (any random 64+ char string)
 *   - DATABASE_URL              (postgres connection)
 *
 * Provider switches (each defaults to "mock" so the app boots without keys):
 *   - SMS_PROVIDER=twilio | msg91 | mock
 *   - MAPS_PROVIDER=googlemaps | mapbox | mock
 *   - PAYMENTS_PROVIDER=razorpay | stripe | mock
 *   - PUSH_PROVIDER=fcm | mock
 *
 * Per-provider keys are read only when that provider is selected.
 */

const required = (key: string, fallback?: string): string => {
  const v = process.env[key] ?? fallback;
  if (!v) throw new Error(`[config] missing required env: ${key}`);
  return v;
};

const optional = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

const optionalNum = (key: string, fallback: number): number => {
  const v = process.env[key];
  return v ? Number(v) : fallback;
};

export const config = {
  env: optional("NODE_ENV", "development") as "development" | "production" | "test",

  // Core
  jwtSecret: optional("JWT_SECRET", "dev-secret-replace-in-production-min-32-chars"),
  jwtIssuer: optional("JWT_ISSUER", "jeevan-rakshak"),
  jwtAccessTtlSec: optionalNum("JWT_ACCESS_TTL_SEC", 60 * 60 * 24 * 30),
  databaseUrl: optional(
    "DATABASE_URL",
    "postgres://postgres:postgres@localhost:5432/jr_v0"
  ),

  // Internal API secret (separate from JWT — used for service-to-service calls
  // between api-server and socket-server). Don't reuse JWT secret.
  internalApiSecret: optional("INTERNAL_API_SECRET", "dev-internal-secret-change-in-prod"),

  // Admin API key — required header `x-admin-key` to access /api/v1/admin/*.
  // Defaults to a random-looking string, but the boot hardening check will
  // refuse to start the API in production if this is the default.
  adminApiKey: optional("ADMIN_API_KEY", "dev-admin-key-change-in-prod"),

  // CORS allowlist. Comma-separated origins. "*" means any (dev only).
  corsAllowedOrigins: optional("CORS_ALLOWED_ORIGINS", "*"),

  // Rate limits — applied per IP.
  rateLimitOtpPerMin: optionalNum("RATE_LIMIT_OTP_PER_MIN", 5),
  rateLimitVerifyPerMin: optionalNum("RATE_LIMIT_VERIFY_PER_MIN", 10),
  rateLimitGenericPerMin: optionalNum("RATE_LIMIT_GENERIC_PER_MIN", 120),
  otpMaxFailedAttempts: optionalNum("OTP_MAX_FAILED_ATTEMPTS", 5),

  // Service ports
  apiPort: optionalNum("API_PORT", 4000),
  socketPort: optionalNum("SOCKET_PORT", 4001),
  apiBaseUrl: optional("API_BASE_URL", "http://localhost:4000"),
  socketBaseUrl: optional("SOCKET_BASE_URL", "http://localhost:4001"),

  // Booking economics
  baseFareInr: optionalNum("BASE_FARE_INR", 500),
  perKmFareInr: optionalNum("PER_KM_FARE_INR", 30),
  bookingTimeoutSec: optionalNum("BOOKING_TIMEOUT_SEC", 90),

  // SMS provider for OTP delivery
  sms: {
    provider: optional("SMS_PROVIDER", "mock") as "twilio" | "msg91" | "mock",
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
      authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
      from: process.env.TWILIO_FROM ?? ""
    },
    msg91: {
      authKey: process.env.MSG91_AUTH_KEY ?? "",
      templateId: process.env.MSG91_TEMPLATE_ID ?? "",
      sender: process.env.MSG91_SENDER ?? ""
    }
  },

  // Maps / geocoding
  maps: {
    provider: optional("MAPS_PROVIDER", "mock") as "googlemaps" | "mapbox" | "mock",
    google: {
      apiKey: process.env.GOOGLE_MAPS_API_KEY ?? ""
    },
    mapbox: {
      accessToken: process.env.MAPBOX_ACCESS_TOKEN ?? ""
    }
  },

  // Payments
  payments: {
    provider: optional("PAYMENTS_PROVIDER", "mock") as
      | "razorpay"
      | "stripe"
      | "mock",
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID ?? "",
      keySecret: process.env.RAZORPAY_KEY_SECRET ?? ""
    },
    stripe: {
      secret: process.env.STRIPE_SECRET ?? ""
    }
  },

  // Push notifications
  push: {
    provider: optional("PUSH_PROVIDER", "mock") as "fcm" | "mock",
    fcm: {
      serverKey: process.env.FCM_SERVER_KEY ?? ""
    }
  },

  // Mobile app config (read by EAS / app.config.ts at build time on the team's side)
  mobile: {
    apiBaseUrl: optional("EXPO_PUBLIC_API_BASE_URL", "http://localhost:4000"),
    socketBaseUrl: optional("EXPO_PUBLIC_SOCKET_BASE_URL", "http://localhost:4001"),
    eas: {
      userProjectId: process.env.USER_EAS_PROJECT_ID ?? "",
      driverProjectId: process.env.DRIVER_EAS_PROJECT_ID ?? ""
    }
  },

  // Feature flags (boolean strings: "true" | "false")
  flags: {
    require_kyc_for_drivers: optional("FLAG_REQUIRE_KYC", "false") === "true",
    enable_payments: optional("FLAG_ENABLE_PAYMENTS", "false") === "true",
    enable_push: optional("FLAG_ENABLE_PUSH", "false") === "true",
    show_demo_bypass: optional("FLAG_DEMO_BYPASS", "false") === "true"
  }
} as const;

export type AppConfig = typeof config;
export { required, optional, optionalNum };
