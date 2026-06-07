import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * EXPO_PUBLIC_* are inlined at bundle time. In release, localhost defaults are
 * not used — set EXPO_PUBLIC_API_BASE_URL / EXPO_PUBLIC_SOCKET_BASE_URL (see .env.production).
 */
declare const __DEV__: boolean;
// Metro's static-analysis inliner only matches the literal `process.env.EXPO_PUBLIC_*`
// pattern. Indirect access (e.g. via globalThis) bypasses inlining and leaves
// the value `undefined` on native Android — which falls through to the localhost
// default and crashes the env-check at startup. Declare `process` locally so
// TypeScript is happy without pulling in @types/node.
declare const process: { env: Record<string, string | undefined> };

export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? (__DEV__ ? "http://localhost:4000" : "");
export const SOCKET_BASE =
  process.env.EXPO_PUBLIC_SOCKET_BASE_URL ?? (__DEV__ ? "http://localhost:4001" : "");

const TOKEN_KEY = "jr.user.token";
// v1.1.0 (CR#12): cache the last profile so a cold-start with a valid token
// can render Home immediately (no Google re-pick) while /me refreshes in the
// background. Cleared on explicit logout / 401.
const PROFILE_KEY = "jr.user.profile";

let inMemoryToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  const t = await AsyncStorage.getItem(TOKEN_KEY);
  inMemoryToken = t;
  return t;
}

export async function setToken(token: string) {
  inMemoryToken = token;
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken() {
  inMemoryToken = null;
  await AsyncStorage.removeItem(TOKEN_KEY);
  await AsyncStorage.removeItem(PROFILE_KEY);
}

export async function setCachedProfile(profile: unknown) {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* best-effort cache */
  }
}

export async function getCachedProfile(): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

type RequestOpts = { method?: string; body?: unknown; auth?: boolean };

export async function api<T = any>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(json?.error ?? `request_failed_${res.status}`);
    (err as any).status = res.status;
    (err as any).details = json;
    throw err;
  }
  return json as T;
}

// ─── Concrete endpoints ───────────────────────────────────────────────

export type EmergencyType =
  | "ACCIDENT_TRAUMA"
  | "CARDIAC"
  | "BREATHING_DISTRESS"
  | "PREGNANCY_NEONATAL"
  | "GENERAL_CRITICAL_TRANSFER";

export type BookingStatus =
  | "REQUESTED"
  | "ACCEPTED"
  | "ARRIVED"
  | "PICKED_UP"
  | "COMPLETED"
  | "CANCELLED"
  | "TIMED_OUT";

export type Booking = {
  id: string;
  // v1.1.0: human-readable sequential booking number (#1000xx). Shown to the
  // patient instead of the UUID. May be absent on very old rows.
  displayId?: string | null;
  userId: string;
  driverId: string | null;
  emergencyType: EmergencyType;
  status: BookingStatus;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string | null;
  dropLat?: number | null;
  dropLng?: number | null;
  dropAddress?: string | null;
  // v1.1.0 (CR#3/#6): destination hospital FK (auto-assigned at pickup).
  destHospitalId?: string | null;
  fareEstimateInr?: number | null;
  fareFinalInr?: number | null;
  couponCode?: string | null;
  discountInr?: number | null;
  payableInr?: number | null;
  patientName?: string | null;
  patientAge?: number | null;
  patientGender?: "M" | "F" | "O" | null;
  patientCondition?: string | null;
  patientNotes?: string | null;
  rating?: number | null;
  feedback?: string | null;
  rideOtpCode?: string | null;
  // v1.0.15: SOS marker + post-completion payment state.
  isSos?: boolean | null;
  paidInr?: number | null;
  paidAt?: string | null;
  paidCoupon?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  arrivedAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

export type GoogleSignInResult =
  | { kind: "signedIn"; accessToken: string; profile: any }
  | { kind: "needsProfile"; googleProfile: { email: string; name: string | null; picture: string | null; sub: string } };

export const auth = {
  // Legacy OTP path — kept while the rollout is in progress so we can A/B
  // and to give ops a fallback if Google Sign-In ever has an outage. Both
  // endpoints will be removed in v1.1.1 once the entire pilot has migrated.
  requestOtp: (phone: string, role: "user" | "driver") =>
    api<{ message: string; demoOtp?: string; channel: string; ttlSec: number }>(
      "/api/v1/auth/login",
      { method: "POST", body: { phone, role }, auth: false }
    ),
  verifyOtp: (phone: string, role: "user" | "driver", code: string) =>
    api<{ accessToken: string; profile: any }>("/api/v1/auth/verify-otp", {
      method: "POST",
      body: { phone, role, code },
      auth: false
    }),
  // v1.1.0: Google Sign-In. Mobile gets the ID token from
  // @react-native-google-signin, posts it here, server returns either a JWT
  // (existing user) or { needsProfile, googleProfile } for first-time signup.
  googleStart: (idToken: string, role: "user" | "driver") =>
    api<
      | { accessToken: string; profile: any; needsProfile?: undefined }
      | { needsProfile: true; googleProfile: { email: string; name: string | null; picture: string | null; sub: string }; accessToken?: undefined }
    >("/api/v1/auth/google", { method: "POST", body: { idToken, role }, auth: false }),
  // Posted after the new user fills in phone+name. Server re-verifies the
  // ID token, enforces email↔phone uniqueness, and returns the JWT.
  googleComplete: (input: { idToken: string; role: "user" | "driver"; phone: string; name: string }) =>
    api<{ accessToken: string; profile: any }>("/api/v1/auth/google/complete", {
      method: "POST",
      body: input,
      auth: false
    })
};

export const me = {
  get: () => api<{ role: string; profile: any }>("/api/v1/me"),
  registerPushToken: (token: string) =>
    api<{ ok: true }>("/api/v1/me/push-token", { method: "POST", body: { token } }),
  update: (patch: Partial<{ name: string; bloodGroup: string; allergies: string; emergencyContact: string }>) =>
    api<{ role: string; profile: any }>("/api/v1/me", { method: "PATCH", body: patch }),
  // v1.0.13: Google Play account-deletion compliance. Soft-deletes the row
  // (disabled=true + PII nulled), cancels in-flight bookings, retains phone
  // for trip-history continuity. Phone is the only field we keep so the
  // driver-side payout records aren't orphaned.
  delete: () => api<{ deleted: boolean }>("/api/v1/me/delete", { method: "POST" })
};

export type FareQuote = {
  baseFareInr: number;            // semantics: minimum-fare floor in v1.0.13 revised
  perKmFareInr: number;
  distanceKm: number | null;
  distanceChargeInr: number;
  totalInr: number;
  etaMin: number | null;
  multipliers: {
    vehicleType: string;
    vehicleMult: number;
    emergencyType: string | null;
    emergencyMult: number;
    nightSurcharge: number;
    isNight: boolean;
  };
  coupon: { couponCode: string | null; discountInr: number; payableInr: number };
};

export const fares = {
  // v1.0.13 (revised): server-computed dynamic fare quote with multipliers.
  // Mobile UI mirrors the breakdown so the patient sees exactly what hits the
  // booking row. Single source of truth — no more "₹250 in app, ₹500 admin".
  quote: (input: {
    pickupLat: number;
    pickupLng: number;
    dropLat?: number | null;
    dropLng?: number | null;
    couponCode?: string | null;
    vehicleType?: string | null;
    emergencyType?: string | null;
  }) =>
    api<FareQuote>("/api/v1/fares/quote", { method: "POST", body: input })
};

export const bookings = {
  create: (input: {
    emergencyType: EmergencyType;
    pickupLat: number;
    pickupLng: number;
    pickupAddress?: string;
    dropLat?: number;
    dropLng?: number;
    dropAddress?: string;
    couponCode?: string;
    // v1.0.15: signals an SOS dispatch. Server routes through the cascade
    // engine instead of the public broadcast pool.
    isSos?: boolean;
  }) => api<{ booking: Booking }>("/api/v1/bookings", { method: "POST", body: input }),
  // v1.0.15: post-completion payment for SOS rides. Idempotent — re-calling
  // with the same booking returns the existing payment shape.
  markPaid: (id: string, couponCode?: string | null) =>
    api<{
      booking: Booking;
      paid: { inr: number; at: string; coupon: string | null };
      breakdown?: { finalFare: number; couponCode: string | null; discountInr: number; payableInr: number };
    }>(`/api/v1/bookings/${id}/mark-paid`, { method: "POST", body: { couponCode } }),
  get: (id: string) => api<{ booking: Booking }>(`/api/v1/bookings/${id}`),
  mine: () => api<{ bookings: Booking[] }>("/api/v1/bookings/mine"),
  pending: () => api<{ bookings: Booking[] }>("/api/v1/bookings/pending"),
  accept: (id: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/accept`, { method: "POST", body: {} }),
  arrived: (id: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/arrived`, { method: "POST", body: {} }),
  pickup: (id: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/pickup`, { method: "POST", body: {} }),
  complete: (id: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/complete`, { method: "POST", body: {} }),
  rate: (id: string, rating: number, feedback?: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/rate`, {
      method: "POST",
      body: { rating, feedback }
    }),
  cancel: (id: string, reason?: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/cancel`, { method: "POST", body: { reason } }),
  patientInfo: (id: string, info: {
    patientName?: string;
    patientAge?: number;
    patientGender?: "M" | "F" | "O";
    patientCondition?: string;
    patientNotes?: string;
  }) => api<{ booking: Booking }>(`/api/v1/bookings/${id}/patient-info`, { method: "POST", body: info })
};

// v1.2.4 (helpdesk): user app Help & Support tickets. The /me/tickets*
// endpoints stream raw pgClient rows (snake_case, like the driver's
// /driver/tickets), so these types mirror the SQL aliases exactly — keep them
// in lockstep with the SELECT column lists in the api-server `/api/v1/me/tickets*`
// handlers (services/api-server/src/routes/me.ts).
export type SupportTicket = {
  id: string;
  subject_type: "GENERAL" | "RIDE";
  category: "ISSUE" | "FEEDBACK";
  message: string;
  status: "OPEN" | "RESOLVED";
  created_at: string;
  resolved_at: string | null;
  booking_id: string | null;
  // Human-readable booking number (#1000xx) — never the raw UUID. May be null
  // for a RIDE ticket whose booking predates display ids, or a GENERAL ticket.
  booking_display_id: string | null;
};

export type SupportTicketMessage = {
  id: string;
  ticket_id: string;
  author_role: "ADMIN" | "HOSPITAL" | "DRIVER" | "USER";
  author_name: string | null;
  body: string;
  created_at: string;
};

export const tickets = {
  list: () => api<{ tickets: SupportTicket[] }>("/api/v1/me/tickets"),
  create: (input: {
    category?: "ISSUE" | "FEEDBACK";
    subjectType?: "GENERAL" | "RIDE";
    bookingId?: string;
    message: string;
  }) => api<{ ok: true; id: string }>("/api/v1/me/tickets", { method: "POST", body: input }),
  get: (id: string) =>
    api<{ ticket: SupportTicket; messages: SupportTicketMessage[] }>(`/api/v1/me/tickets/${id}`),
  reply: (id: string, body: string) =>
    api<{ message: SupportTicketMessage }>(`/api/v1/me/tickets/${id}/messages`, {
      method: "POST",
      body: { body }
    })
};

// v1.3.0 (safety): in-ride panic / duress alert. raise() fans out to nearby
// available drivers + admin with the raiser's live location; cancel() stands
// the alert down. The api() wrapper auto-attaches the bearer token.
export const safety = {
  raise: (bookingId: string, lat: number, lng: number) =>
    api<{ alert: { id: string }; notified: number }>("/api/v1/safety/raise", {
      method: "POST",
      body: { bookingId, lat, lng }
    }),
  cancel: (alertId: string) =>
    api<{ ok: true }>(`/api/v1/safety/${alertId}/cancel`, { method: "POST", body: {} })
};

export const driver = {
  setAvailability: (status: "OFFLINE" | "AVAILABLE" | "ON_TRIP", lat?: number, lng?: number) =>
    api<{ driver: any }>("/api/v1/driver/availability", {
      method: "POST",
      body: { status, lat, lng }
    }),
  pushLocation: (
    lat: number,
    lng: number,
    bookingId?: string,
    speedKmh?: number,
    headingDeg?: number
  ) =>
    api<{ ok: true }>("/api/v1/driver/location", {
      method: "POST",
      body: { lat, lng, bookingId, speedKmh, headingDeg }
    })
};
