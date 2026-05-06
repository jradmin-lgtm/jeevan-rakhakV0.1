import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  doublePrecision,
  boolean,
  pgEnum,
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
    name: text("name"),
    bloodGroup: text("blood_group"),
    allergies: text("allergies"),
    emergencyContact: text("emergency_contact"),
    isDemo: boolean("is_demo").default(false).notNull(),
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
    name: text("name"),
    licenseNumber: text("license_number"),
    vehicleNumber: text("vehicle_number"),
    vehicleType: text("vehicle_type").default("BLS"),
    status: driverStatusEnum("status").default("OFFLINE").notNull(),
    kycVerified: boolean("kyc_verified").default(false).notNull(),
    rating: doublePrecision("rating").default(5.0).notNull(),
    lastLat: doublePrecision("last_lat"),
    lastLng: doublePrecision("last_lng"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    isDemo: boolean("is_demo").default(false).notNull(),
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
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "set null" })
      .notNull(),
    driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "set null" }),
    emergencyType: emergencyTypeEnum("emergency_type").notNull(),
    status: bookingStatusEnum("status").default("REQUESTED").notNull(),
    pickupLat: doublePrecision("pickup_lat").notNull(),
    pickupLng: doublePrecision("pickup_lng").notNull(),
    pickupAddress: text("pickup_address"),
    dropLat: doublePrecision("drop_lat"),
    dropLng: doublePrecision("drop_lng"),
    dropAddress: text("drop_address"),
    fareEstimateInr: integer("fare_estimate_inr"),
    fareFinalInr: integer("fare_final_inr"),
    rating: integer("rating"),
    feedback: text("feedback"),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingEvent = typeof bookingEvents.$inferSelect;
export type DriverLocation = typeof driverLocations.$inferSelect;
