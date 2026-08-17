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

  // Launch / geofence — the single city the pilot is live in. The geofence
  // center is the seeded default hospital (SRMS IMS Hospital, Bareilly) and
  // the radius bounds where we can actually dispatch. Read straight from config
  // in the booking hot path (no DB round-trip) so out-of-area requests are
  // rejected before any row insert, emit, or cascade.
  launchCityName: optional("LAUNCH_CITY_NAME", "Bareilly"),
  launchHospitalName: optional("LAUNCH_HOSPITAL_NAME", "SRMS IMS Hospital, Bareilly"),
  launchRadiusKm: optionalNum("LAUNCH_RADIUS_KM", 100),
  // CR1 (2026-08): corrected — the previous default (28.4875, 79.4452) was
  // actually CHC Bhojipura's coordinates, not SRMS's. This value is the
  // on-ground-verified SRMS IMS pin (Ram Murti Puram, Nainital Rd, Bhoji
  // Pura, Bareilly 243202), superseding an earlier OSM-derived estimate.
  geofenceCenterLat: optionalNum("GEOFENCE_CENTER_LAT", 28.481270),
  geofenceCenterLng: optionalNum("GEOFENCE_CENTER_LNG", 79.443282),
  // Top-level mirror of flags.geofence_enabled so the booking hot path and the
  // public /service-area endpoint can read config.geofenceEnabled directly.
  // Same env var (FLAG_GEOFENCE_ENABLED) as the flag below — single source.
  geofenceEnabled: optional("FLAG_GEOFENCE_ENABLED", "true") === "true",

  // v1.2.0 (CR#2) — driver-initiated cancellation tuning.
  // `driverCancelPatientWaitS` is the server-authoritative wait window (seconds)
  // a driver must observe before a patient-reason cancellation is allowed.
  // `driverCancelFlagRate` is the cancel/accept ratio at/above which admin flags
  // a driver as a high-cancellation outlier.
  driverCancelPatientWaitS: Number(optional("DRIVER_CANCEL_PATIENT_WAIT_S", "300")),
  driverCancelFlagRate: Number(optional("DRIVER_CANCEL_FLAG_RATE", "0.3")),

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

  // 2026-08-17 exploration: real road-time ranking (Google Distance Matrix)
  // for SOS/safety dispatch, and live-traffic ETA (Google Directions) for
  // post-pickup + fare-quote display. Both default OFF so unset envs (current
  // Render state) leave the existing haversine-based behavior byte-for-byte
  // unchanged. Both call sites fall back to haversine on any Google API
  // failure/timeout — dispatch must never hard-depend on a third-party API.
  // See lib/google-maps.ts.
  googleDispatchRankingEnabled: optional("FLAG_GOOGLE_DISPATCH_ENABLED", "false") === "true",
  googleLiveEtaEnabled: optional("FLAG_GOOGLE_ETA_ENABLED", "false") === "true",

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

  // Google Sign-In (v1.1.0). Web client ID is shared by Android + iOS + web
  // because it's the audience the ID token is issued for. The Android client
  // IDs registered in Cloud Console don't need to be referenced here — Google
  // Play Services matches them by (package, SHA-1) at runtime.
  googleAuth: {
    webClientId: process.env.GOOGLE_WEB_CLIENT_ID ?? ""
  },

  // Feature flags (boolean strings: "true" | "false")
  flags: {
    require_kyc_for_drivers: optional("FLAG_REQUIRE_KYC", "false") === "true",
    enable_payments: optional("FLAG_ENABLE_PAYMENTS", "false") === "true",
    enable_push: optional("FLAG_ENABLE_PUSH", "false") === "true",
    show_demo_bypass: optional("FLAG_DEMO_BYPASS", "false") === "true",
    pilot_bypass_otp: optional("FLAG_PILOT_BYPASS_OTP", "false") === "true",
    geofence_enabled: optional("FLAG_GEOFENCE_ENABLED", "true") === "true"
  }
} as const;

export type AppConfig = typeof config;
export { required, optional, optionalNum };
