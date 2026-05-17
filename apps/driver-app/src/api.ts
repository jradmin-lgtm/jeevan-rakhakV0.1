import AsyncStorage from "@react-native-async-storage/async-storage";

declare const __DEV__: boolean;
// Metro's inliner only handles direct `process.env.EXPO_PUBLIC_*` access.
// Indirect (globalThis.process) leaves the value undefined on native Android.
declare const process: { env: Record<string, string | undefined> };

export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? (__DEV__ ? "http://localhost:4000" : "");
export const SOCKET_BASE =
  process.env.EXPO_PUBLIC_SOCKET_BASE_URL ?? (__DEV__ ? "http://localhost:4001" : "");

const TOKEN_KEY = "jr.driver.token";

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
    throw err;
  }
  return json as T;
}

export type Booking = {
  id: string;
  userId: string;
  driverId: string | null;
  emergencyType: string;
  status: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string | null;
  dropLat?: number | null;
  dropLng?: number | null;
  dropAddress?: string | null;
  fareEstimateInr?: number | null;
  fareFinalInr?: number | null;
  rideOtpCode?: string | null;
  patientName?: string | null;
  patientAge?: number | null;
  patientGender?: "M" | "F" | "O" | null;
  // patientCondition + patientNotes are intentionally NOT included — driver
  // app must never display them (medical-privacy rule per team feedback).
  paramedicAssessment?: Record<string, unknown> | null;
  rating?: number | null;
  feedback?: string | null;
  ratingByDriver?: number | null;
  feedbackByDriver?: string | null;
  createdAt: string;
};

export type GoogleSignInResult =
  | { kind: "signedIn"; accessToken: string; profile: any }
  | { kind: "needsProfile"; googleProfile: { email: string; name: string | null; picture: string | null; sub: string } };

export const auth = {
  // Legacy OTP path — kept for fallback while Google Sign-In rolls out.
  requestOtp: (phone: string) =>
    api<{ message: string; demoOtp?: string; channel: string; ttlSec: number }>(
      "/api/v1/auth/login",
      { method: "POST", body: { phone, role: "driver" }, auth: false }
    ),
  verifyOtp: (phone: string, code: string) =>
    api<{ accessToken: string; profile: any }>("/api/v1/auth/verify-otp", {
      method: "POST",
      body: { phone, role: "driver", code },
      auth: false
    }),
  // v1.1.0 Google Sign-In — symmetric with the user app.
  googleStart: (idToken: string) =>
    api<
      | { accessToken: string; profile: any; needsProfile?: undefined }
      | { needsProfile: true; googleProfile: { email: string; name: string | null; picture: string | null; sub: string }; accessToken?: undefined }
    >("/api/v1/auth/google", { method: "POST", body: { idToken, role: "driver" }, auth: false }),
  googleComplete: (input: { idToken: string; phone: string; name: string }) =>
    api<{ accessToken: string; profile: any }>("/api/v1/auth/google/complete", {
      method: "POST",
      body: { ...input, role: "driver" },
      auth: false
    })
};

export const me = {
  get: () => api<{ role: string; profile: any }>("/api/v1/me"),
  update: (patch: { name?: string }) =>
    api<{ role: string; profile: any }>("/api/v1/me", { method: "PATCH", body: patch })
};

export const driver = {
  setAvailability: (status: "OFFLINE" | "AVAILABLE", lat?: number, lng?: number) =>
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
    }),
  submitKyc: (data: {
    name?: string;
    photoUrl?: string;
    vehicleNumber?: string;
    vehicleType?: string;
    licenseNumber?: string;
    rcNumber?: string;
    insuranceNumber?: string;
    hospitalId?: string;
    hospitalName?: string;
  }) => api<{ driver: any }>("/api/v1/driver/kyc", { method: "POST", body: data })
};

export const bookings = {
  pending: () => api<{ bookings: Booking[] }>("/api/v1/bookings/pending"),
  mine: () => api<{ bookings: Booking[] }>("/api/v1/bookings/mine"),
  get: (id: string) => api<{ booking: Booking }>(`/api/v1/bookings/${id}`),
  accept: (id: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/accept`, { method: "POST", body: {} }),
  arrived: (id: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/arrived`, { method: "POST", body: {} }),
  pickup: (id: string, code: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/pickup`, { method: "POST", body: { code } }),
  setDrop: (id: string, dropLat: number, dropLng: number, dropAddress?: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/set-drop`, {
      method: "POST",
      body: { dropLat, dropLng, dropAddress }
    }),
  complete: (id: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/complete`, { method: "POST", body: {} }),
  paramedicAssessment: (id: string, assessment: Record<string, unknown>) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/paramedic-assessment`, { method: "POST", body: assessment }),
  rateByDriver: (id: string, rating: number, feedback?: string) =>
    api<{ booking: Booking }>(`/api/v1/bookings/${id}/rate-by-driver`, {
      method: "POST",
      body: { rating, feedback }
    })
};
