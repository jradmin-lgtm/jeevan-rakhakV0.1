import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * EXPO_PUBLIC_* are inlined at bundle time. In release, localhost defaults are
 * not used — set EXPO_PUBLIC_API_BASE_URL / EXPO_PUBLIC_SOCKET_BASE_URL (see .env.production).
 */
declare const __DEV__: boolean;

const env = ((typeof globalThis !== "undefined" ? (globalThis as any).process : undefined)?.env ?? {}) as Record<string, string | undefined>;

export const API_BASE =
  env.EXPO_PUBLIC_API_BASE_URL ?? (__DEV__ ? "http://localhost:4000" : "");
export const SOCKET_BASE =
  env.EXPO_PUBLIC_SOCKET_BASE_URL ?? (__DEV__ ? "http://localhost:4001" : "");

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
  rating?: number | null;
  feedback?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  arrivedAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
};

export const auth = {
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
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/cancel`, { method: "POST", body: { reason } })
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
