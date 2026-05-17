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
  update: (patch: Partial<{ name: string; bloodGroup: string; allergies: string; emergencyContact: string }>) =>
    api<{ role: string; profile: any }>("/api/v1/me", { method: "PATCH", body: patch })
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
  }) => api<{ booking: Booking }>("/api/v1/bookings", { method: "POST", body: input }),
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
