import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  doublePrecision,
  boolean,
  pgEnum,
  jsonb,
  index
} from "drizzle-orm/pg-core";

export const emergencyTypeEnum = pgEnum("emergency_type", [
  "ACCIDENT_TRAUMA",
  "CARDIAC",
  "BREATHING_DISTRESS",
  "PREGNANCY_NEONATAL",
  "GENERAL_CRITICAL_TRANSFER"
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "REQUESTED",
  "ACCEPTED",
  "ARRIVED",
  "PICKED_UP",
  "COMPLETED",
  "CANCELLED",
  "TIMED_OUT"
]);

export const driverStatusEnum = pgEnum("driver_status", [
  "OFFLINE",
  "AVAILABLE",
  "ON_TRIP"
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phone: text("phone").notNull().unique(),
    // v1.1.0: Google Sign-In primary identity. `email` is unique across all
    // users; `authProvider` is "google" (or null on the legacy OTP-only rows
    // from before the DB wipe). `authSubject` is Google's stable `sub` claim
    // — preferred over email lookups because users can change their Gmail
    // primary alias. `pictureUrl` is from Google's userinfo response.
    email: text("email"),
    authProvider: text("auth_provider"),
    authSubject: text("auth_subject"),
    pictureUrl: text("picture_url"),
    name: text("name"),
    bloodGroup: text("blood_group"),
    allergies: text("allergies"),
    emergencyContact: text("emergency_contact"),
    isDemo: boolean("is_demo").default(false).notNull(),
    // Admin-set disable flag. Disabled users are blocked at /auth/verify-otp
    // (they can still request an OTP — the SMS still goes out — but they
    // can't redeem it). Admins toggle this from the user detail page.
    disabled: boolean("disabled").default(false).notNull(),
    // Reputation — running average of ratings the user has received from
    // drivers. Starts at 5.0; recomputed by the rate-by-driver endpoint.
    // ratingCount drives the running-average formula and is also displayed
    // in admin so ops can spot 1-rating outliers vs many-rating patterns.
    rating: doublePrecision("rating").default(5.0).notNull(),
    ratingCount: integer("rating_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    phoneIdx: index("users_phone_idx").on(t.phone),
    demoIdx: index("users_is_demo_idx").on(t.isDemo)
  })
);

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    phone: text("phone").notNull().unique(),
    // v1.1.0: Google Sign-In identity (see users.email comment).
    email: text("email"),
    authProvider: text("auth_provider"),
    authSubject: text("auth_subject"),
    pictureUrl: text("picture_url"),
    name: text("name"),
    licenseNumber: text("license_number"),
    vehicleNumber: text("vehicle_number"),
    vehicleType: text("vehicle_type").default("BLS"),
    status: driverStatusEnum("status").default("OFFLINE").notNull(),
    kycVerified: boolean("kyc_verified").default(false).notNull(),
    rating: doublePrecision("rating").default(5.0).notNull(),
    // Count of ratings received from patients — drives the running-average
    // formula and lets admin distinguish "5.0 from 1 rating" (new driver)
    // from "4.9 from 200 ratings" (established).
    ratingCount: integer("rating_count").default(0).notNull(),
    lastLat: doublePrecision("last_lat"),
    lastLng: doublePrecision("last_lng"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    isDemo: boolean("is_demo").default(false).notNull(),
    // Admin-set disable flag. Disabled drivers can't redeem an OTP, can't be
    // matched to bookings, and stop appearing in dispatch fan-out.
    disabled: boolean("disabled").default(false).notNull(),
    // KYC fields collected during onboarding. RC / insurance / hospital fields
    // are text only for v1.0.11; actual document upload (photo URLs) lands in
    // v1.0.12 when blob storage is provisioned. kycVerified flips true once
    // admin reviews + approves via the driver detail page.
    photoUrl: text("photo_url"),
    rcNumber: text("rc_number"),
    insuranceNumber: text("insurance_number"),
    hospitalId: text("hospital_id"),
    hospitalName: text("hospital_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    phoneIdx: index("drivers_phone_idx").on(t.phone),
    statusIdx: index("drivers_status_idx").on(t.status),
    demoIdx: index("drivers_is_demo_idx").on(t.isDemo)
  })
);

export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  phone: text("phone").notNull(),
  role: text("role").notNull(),
  code: text("code").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
});

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Short, human-readable booking number for ops + customer support.
    // Sequential from 100000 via the `jr_booking_display_seq` Postgres
    // sequence (defined in api-server bootstrap). Mobile apps still use
    // the UUID `id` for routing / API calls — display_id is admin-facing.
    displayId: text("display_id").unique(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "set null" })
      .notNull(),
    driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "set null" }),
    emergencyType: emergencyTypeEnum("emergency_type").notNull(),
    status: bookingStatusEnum("status").default("REQUESTED").notNull(),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLng: doublePrecision("pickup_lng").notNull(),
    pickupAddress: text("pickup_address"),
    // 4-digit per-ride OTP the patient must read out for the driver to start
    // the trip. Generated at booking creation; cleared once consumed.
    rideOtpCode: text("ride_otp_code"),
    dropLat: doublePrecision("drop_lat"),
    dropLng: doublePrecision("drop_lng"),
    dropAddress: text("drop_address"),
    fareEstimateInr: integer("fare_estimate_inr"),
    fareFinalInr: integer("fare_final_inr"),
    // Coupon applied at booking time (e.g. PILOT100). Captured so admin can
    // see what the patient actually saw, and so post-launch we can audit
    // promotion redemption + reconcile against payments. Null = no coupon.
    couponCode: text("coupon_code"),
    discountInr: integer("discount_inr").default(0).notNull(),
    // Payable = fareFinalInr − discountInr (capped at 0). Recomputed at
    // /complete. Stored so admin doesn't have to re-derive on every read.
    payableInr: integer("payable_inr"),
    // Admin-only fare override — used for off-app billing (e.g. when ops
    // charges a hospital differently from the patient-facing app fare).
    // Mobile apps NEVER read this; user-app + driver-app stay on
    // fareEstimate / fareFinal / payable for their UI. Analytics GMV +
    // Revenue use COALESCE(admin_fare_override_inr, fare_final_inr).
    adminFareOverrideInr: integer("admin_fare_override_inr"),
    adminFareOverrideNote: text("admin_fare_override_note"),
    // Patient details collected by the user app after booking confirmation.
    // patientName / patientAge / patientGender are visible to the driver in
    // the trip card; patientCondition / patientNotes are admin-only (driver
    // app filters them out so the driver focuses on driving, not triage).
    patientName: text("patient_name"),
    patientAge: integer("patient_age"),
    patientGender: text("patient_gender"),
    patientCondition: text("patient_condition"),
    patientNotes: text("patient_notes"),
    // Paramedic assessment recorded by the driver after arriving at pickup.
    // JSONB so we can iterate on field shape without a migration per change.
    // Admin-only visibility — the standard driver dashboard never shows this.
    paramedicAssessment: jsonb("paramedic_assessment"),
    // Patient → driver: 1-5 stars + optional free-text feedback.
    rating: integer("rating"),
    feedback: text("feedback"),
    // Driver → patient: same shape, separate columns so admin can show both
    // perspectives without mixing them up. Either side rates once per trip.
    ratingByDriver: integer("rating_by_driver"),
    feedbackByDriver: text("feedback_by_driver"),
    isDemo: boolean("is_demo").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true })
  },
  (t) => ({
    statusIdx: index("bookings_status_idx").on(t.status),
    userIdx: index("bookings_user_idx").on(t.userId),
    driverIdx: index("bookings_driver_idx").on(t.driverId),
    createdAtIdx: index("bookings_created_at_idx").on(t.createdAt),
    demoIdx: index("bookings_is_demo_idx").on(t.isDemo)
  })
);

export const bookingEvents = pgTable(
  "booking_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .references(() => bookings.id, { onDelete: "cascade" })
      .notNull(),
    actor: text("actor").notNull(),
    type: text("type").notNull(),
    payloadJson: text("payload_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    bookingIdx: index("booking_events_booking_idx").on(t.bookingId)
  })
);

export const driverLocations = pgTable(
  "driver_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "cascade" })
      .notNull(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    speedKmh: doublePrecision("speed_kmh"),
    headingDeg: doublePrecision("heading_deg"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    driverIdx: index("driver_locations_driver_idx").on(t.driverId),
    bookingIdx: index("driver_locations_booking_idx").on(t.bookingId)
  })
);

/**
 * Generic system-level events stream for observability / alerts.
 * Distinct from `booking_events` (which is per-booking state history).
 * Retained for 7 days by a cleanup job; older rows are deleted.
 */
export const systemEvents = pgTable(
  "system_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
    level: text("level").notNull(), // info | warn | error | critical
    source: text("source").notNull(), // api | socket | worker | mobile-user | mobile-driver
    message: text("message").notNull(),
    context: jsonb("context"),
    notified: boolean("notified").notNull().default(false) // set true once email alert sent
  },
  (t) => ({
    tsIdx: index("system_events_ts_idx").on(t.ts),
    levelIdx: index("system_events_level_idx").on(t.level)
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingEvent = typeof bookingEvents.$inferSelect;
export type DriverLocation = typeof driverLocations.$inferSelect;
export type SystemEvent = typeof systemEvents.$inferSelect;
export type NewSystemEvent = typeof systemEvents.$inferInsert;
