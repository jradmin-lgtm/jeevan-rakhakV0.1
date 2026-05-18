/**
 * Ambulance fare configuration — single source of truth.
 *
 * ╭────────────────────────────────────────────────────────────────────────╮
 * │  Edit this file to change pricing. No env vars to twiddle, no admin   │
 * │  setting to flip — just tweak the numbers below and redeploy.         │
 * ╰────────────────────────────────────────────────────────────────────────╯
 *
 * The mobile booking screen quotes from /api/v1/fares/quote, which calls
 * `computeFare()` exported below. The /bookings POST that records the row
 * also calls `computeFare()`, so what the patient sees on the booking
 * screen is exactly what hits `fareEstimateInr` on the row — no drift.
 *
 * Industry calibration notes (mid-2024 Indian private-ambulance surveys):
 *   • BLS (Basic Life Support) base rate is typically ₹100–₹150/km
 *     in metros and tier-2 cities. We use ₹120/km.
 *   • Most operators have a "minimum trip" floor in the ₹250–₹400 range
 *     to cover dispatch + driver time for sub-2 km bookings. We use ₹300.
 *   • Premium vehicle types (ALS / ICU on Wheels) typically carry a
 *     1.5–2× multiplier.
 *   • Priority-dispatch / time-critical emergency surcharges (cardiac,
 *     trauma) are commonly 15–25%.
 *   • Night surcharge (22:00–06:00) is industry-standard at 20–30%.
 *
 * When you change these numbers:
 *   1. Edit the constant.
 *   2. Commit + push (api-server redeploys automatically; if Render's
 *      autodeploy lags, force-redeploy via the API per VERSIONS.md
 *      "operational thumb rules" §2).
 *   3. The user-app's fare card re-quotes on the next mount; no APK
 *      rebuild needed since pricing is server-driven.
 */

// ─────────────────────────────────────────────────────────────────────────
// Core rates
// ─────────────────────────────────────────────────────────────────────────

/** Base per-km rate (INR) for the BLS vehicle type. ALS/ICU multiply this. */
export const RATE_PER_KM = 120;

/** Minimum fare floor (INR). Any distance-based fare below this is bumped
 *  up. Covers dispatch + driver time on sub-2 km trips. */
export const MIN_FARE = 300;

// ─────────────────────────────────────────────────────────────────────────
// Multipliers
// ─────────────────────────────────────────────────────────────────────────

/** Vehicle-type pricing tier. Keys must match the values stored on
 *  drivers.vehicle_type. Unknown / null types default to BLS. */
export const VEHICLE_MULT: Record<string, number> = {
  BLS: 1.0,    // Basic Life Support — entry tier
  ALS: 1.5,    // Advanced Life Support (defibrillator, IV meds)
  ICU: 2.0     // ICU on Wheels — ventilator + advanced monitoring
};

/** Priority-dispatch surcharge by emergency type. Keys must match the
 *  enum values in `bookings.emergency_type`. Unknown defaults to 1.0
 *  (no surcharge). */
export const EMERGENCY_MULT: Record<string, number> = {
  CARDIAC: 1.2,                  // Time-critical → priority dispatch
  ACCIDENT_TRAUMA: 1.2,          // Same
  PREGNANCY_NEONATAL: 1.1,       // Slight uplift for specialised handling
  BREATHING_DISTRESS: 1.0,
  GENERAL_CRITICAL_TRANSFER: 1.0
};

/** Night surcharge — applied when local time is in [start, end) on a 24h
 *  clock in Asia/Kolkata. Defaults: 22:00–06:00 = 1.25 (25% uplift). */
export const NIGHT_SURCHARGE = 1.25;
export const NIGHT_START_HOUR_IST = 22;  // 22:00 IST = surcharge begins
export const NIGHT_END_HOUR_IST = 6;     // 06:00 IST = surcharge ends

// ─────────────────────────────────────────────────────────────────────────
// ETA estimation — informational only; doesn't affect the price.
// ─────────────────────────────────────────────────────────────────────────

/** Average urban-India ambulance speed (km/h). Calibrated to weighted
 *  city averages: signal density + sirens + lane priority work out to
 *  ~28 km/h effective for the trip-planning ETA. */
export const AVG_KMH = 28;

/** Road-factor multiplier to account for non-straight routes. A
 *  haversine straight line is always shorter than the actual driving
 *  distance — 1.4× is the industry rule-of-thumb for urban India. */
export const ROAD_FACTOR = 1.4;

// ─────────────────────────────────────────────────────────────────────────
// Coupons — pilot has one promo. Promote to a `coupons` table once we
// need expiries, per-user caps, or admin CRUD.
// ─────────────────────────────────────────────────────────────────────────

export const COUPONS: Record<string, { percentOff: number; flatOffInr: number }> = {
  PILOT100: { percentOff: 100, flatOffInr: 0 }
};

// ─────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────

/** Haversine straight-line distance between two coords (km). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Trip-planning ETA (minutes). km × road factor / avg speed × 60. */
export function estimateEtaMin(km: number): number {
  return Math.max(1, Math.round((km * ROAD_FACTOR / AVG_KMH) * 60));
}

/** Whether the given moment (default: now) falls in the night surcharge
 *  window in IST. Computed via Intl so DST/timezone shifts don't bite us. */
export function isNightIST(now: Date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Kolkata"
    }).format(now)
  );
  return hour >= NIGHT_START_HOUR_IST || hour < NIGHT_END_HOUR_IST;
}

/** Apply a coupon code to a base amount. Unknown codes are silently
 *  ignored (we return "no discount") rather than rejecting the request —
 *  the user app validates codes before submit anyway. */
export function applyCoupon(amountInr: number, rawCode: string | undefined | null) {
  if (!rawCode) return { couponCode: null as string | null, discountInr: 0, payableInr: amountInr };
  const code = rawCode.trim().toUpperCase();
  const promo = COUPONS[code];
  if (!promo) return { couponCode: null as string | null, discountInr: 0, payableInr: amountInr };
  const pctDiscount = Math.round((amountInr * promo.percentOff) / 100);
  const discountInr = Math.min(amountInr, pctDiscount + promo.flatOffInr);
  const payableInr = Math.max(0, amountInr - discountInr);
  return { couponCode: code, discountInr, payableInr };
}

// ─────────────────────────────────────────────────────────────────────────
// The main entrypoint. Used by /api/v1/fares/quote AND /api/v1/bookings
// POST so the patient and the booking row see identical numbers.
// ─────────────────────────────────────────────────────────────────────────

export type FareBreakdown = {
  baseFareInr: number;            // = MIN_FARE; legacy name kept for client compat
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

export function computeFare(
  pickupLat: number,
  pickupLng: number,
  dropLat?: number | null,
  dropLng?: number | null,
  couponCode?: string | null,
  vehicleType?: string | null,
  emergencyType?: string | null,
  now: Date = new Date()
): FareBreakdown {
  let distanceKm: number | null = null;
  let etaMin: number | null = null;
  let distanceChargeInr = 0;

  if (dropLat != null && dropLng != null) {
    distanceKm = haversineKm(pickupLat, pickupLng, dropLat, dropLng);
    etaMin = estimateEtaMin(distanceKm);
    distanceChargeInr = Math.max(MIN_FARE, Math.round(RATE_PER_KM * distanceKm));
  } else {
    distanceChargeInr = MIN_FARE;
  }

  const vMult = VEHICLE_MULT[String(vehicleType ?? "BLS")] ?? 1.0;
  const eMult = EMERGENCY_MULT[String(emergencyType ?? "")] ?? 1.0;
  const night = isNightIST(now) ? NIGHT_SURCHARGE : 1.0;

  const totalInr = Math.round(distanceChargeInr * vMult * eMult * night);
  const coupon = applyCoupon(totalInr, couponCode);

  return {
    baseFareInr: MIN_FARE,
    perKmFareInr: RATE_PER_KM,
    distanceKm: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
    distanceChargeInr,
    totalInr,
    etaMin,
    multipliers: {
      vehicleType: vehicleType ?? "BLS",
      vehicleMult: vMult,
      emergencyType: emergencyType ?? null,
      emergencyMult: eMult,
      nightSurcharge: night,
      isNight: night > 1
    },
    coupon
  };
}

/** Just the total — convenience for `/bookings` POST which doesn't need
 *  the full breakdown (only the number that gets persisted). */
export function computeFareTotal(
  pickupLat: number,
  pickupLng: number,
  dropLat?: number,
  dropLng?: number,
  vehicleType?: string | null,
  emergencyType?: string | null
): number {
  return computeFare(
    pickupLat, pickupLng, dropLat, dropLng,
    null, vehicleType, emergencyType
  ).totalInr;
}
