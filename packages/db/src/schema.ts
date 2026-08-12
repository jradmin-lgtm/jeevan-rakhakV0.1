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
  index,
  uniqueIndex,
  customType
} from "drizzle-orm/pg-core";

// CR6 (2026-08): raw image bytes for KYC documents. drizzle-orm/pg-core has
// no built-in `bytea` column helper, so it's defined once here via customType.
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  }
});

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
    // v1.1.0 push: FCM device token (from expo-notifications
    // getDevicePushTokenAsync on Android). Used to send status-change
    // notifications even when the app is backgrounded/killed.
    pushToken: text("push_token"),
    // CR3/CR4 (2026-08): synced from the app's in-app language toggle
    // (POST /api/v1/me { preferredLang }) so server-composed push
    // notifications can localize. UI copy stays client-side (i18n.ts);
    // this only drives which push-string template gets sent.
    preferredLang: text("preferred_lang").default("en").notNull(),
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
    // v1.1.0 push: FCM device token — used to alert the driver of a new
    // SOS/booking even when the app is backgrounded/killed.
    pushToken: text("push_token"),
    // CR3/CR4 (2026-08): synced from the driver app's language toggle so
    // server-composed push templates (SOS/booking alerts) can localize.
    preferredLang: text("preferred_lang").default("en").notNull(),
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
    // CR6 (2026-08): KYC redesign — Ambulance Details + Driver Details.
    // employmentType: "hospital_employee" | "private_driver". employeeNumber
    // only applicable/mandatory when employmentType === "hospital_employee".
    // Document photos live in `driverDocuments` below, not here.
    employmentType: text("employment_type"),
    employeeNumber: text("employee_number"),
    pucNumber: text("puc_number"),
    fitnessNumber: text("fitness_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    phoneIdx: index("drivers_phone_idx").on(t.phone),
    statusIdx: index("drivers_status_idx").on(t.status),
    demoIdx: index("drivers_is_demo_idx").on(t.isDemo)
  })
);

// CR6 (2026-08): one row per (driver, document type). Kept off the `drivers`
// table so image bytes never ride along on the hot-path driver queries
// (dispatch eligibility, admin lists, /me) that select from `drivers`.
export const driverDocuments = pgTable(
  "driver_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    // 2026-08: up to 3 pages per doc type (e.g. Aadhar front/back, a licence
    // with a second page). page 1 is the only page any "required" check reads.
    page: integer("page").notNull().default(1),
    contentType: text("content_type").notNull(),
    data: bytea("data").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    driverDoctypeIdx: index("driver_documents_driver_doctype_idx").on(t.driverId, t.docType)
  })
);

// 2026-08: reissue-request queue for the identity docs a driver can't just
// freely self-swap (licence/aadhar/pan — see REISSUE_ELIGIBLE_DOC_TYPES in
// drivers.ts). Ticket-linked so the request is tracked in the existing
// helpdesk thread; the uploaded photo sits here as PENDING until an admin
// approves it (copied into driverDocuments page 1) or rejects it.
export const driverDocumentUpdates = pgTable(
  "driver_document_updates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driver_id").notNull().references(() => drivers.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(),
    contentType: text("content_type").notNull(),
    data: bytea("data").notNull(),
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "set null" }),
    status: text("status").default("PENDING").notNull(), // 'PENDING' | 'APPROVED' | 'REJECTED'
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (t) => ({
    driverStatusIdx: index("driver_document_updates_driver_status_idx").on(t.driverId, t.status)
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
    // v1.1.0 (CR#3/#6): destination hospital. In the current operational phase
    // every ride goes to the single active default hospital (SRMS IMS,
    // Bareilly); auto-assigned on the PICKED_UP transition. FK is nullable +
    // ON DELETE SET NULL so deactivating a hospital never orphans a booking.
    // dropLat/dropLng/dropAddress hold the resolved snapshot (so historical
    // bookings keep their destination even if the hospital row later moves).
    destHospitalId: uuid("dest_hospital_id").references((): any => hospitals.id, {
      onDelete: "set null"
    }),
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
    // 2026-08-12: multi-select conditions (a patient can be e.g. both "Road
    // Accident" AND "Severe Bleeding"). Added alongside the old single-value
    // column rather than replacing it — every read site falls back to
    // wrapping patientCondition in a 1-item array for bookings created
    // before this change, so old data keeps displaying correctly.
    patientConditions: jsonb("patient_conditions").$type<string[]>(),
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
    // v1.0.15: SOS marker. True when the booking originated from the SOS
    // panic button (cascade dispatch + post-completion payment screen). False
    // for normal Book-Ambulance bookings (existing broadcast pool + upfront
    // fare). Replaces the brittle "pickupAddress starts with 'SOS · '" check
    // the SOS flow previously relied on.
    isSos: boolean("is_sos").default(false).notNull(),
    // v1.0.15: post-completion payment. `paidAt IS NULL` is the derived
    // "awaiting payment" state — no new status column. SOS rides leave this
    // null until the patient taps "Mark paid" on PaymentScreen; normal flow
    // auto-marks paid at /complete since the patient saw the fare upfront.
    // `paidInr` is what the patient actually paid (₹0 in pilot via PILOT100).
    paidInr: integer("paid_inr"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidCoupon: text("paid_coupon"),
    isDemo: boolean("is_demo").default(false).notNull(),
    // v1.2.0 (CR#2) — server-side wait-clock anchor for patient-reason driver
    // cancellations. Set once when the driver starts the "patient not
    // available/responding" wait; the cancel route enforces the configured
    // wait window against this timestamp (server-authoritative, not client).
    cancelWaitStartedAt: timestamp("cancel_wait_started_at", { withTimezone: true }),
    // v1.2.0 (CR#3) — hospital "acknowledge — preparing" loop-closer. Set when
    // the destination hospital acknowledges an inbound ride from the portal.
    hospitalAckAt: timestamp("hospital_ack_at", { withTimezone: true }),
    hospitalAckNote: text("hospital_ack_note"),
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

/**
 * v1.0.15 — "last known position" heartbeat table. One row per driver,
 * upserted by POST /driver/heartbeat every 60s while online + foregrounded.
 * Used by the SOS cascade engine to pick the nearest available drivers via
 * Haversine on (lat, lng) with a 5-min staleness threshold on updatedAt.
 *
 * NOTE: separate from `driverLocations` above which is an append-only
 * trip-time GPS log (one row per 5s ping during an active ride).
 */
export const driverHeartbeats = pgTable(
  "driver_heartbeats",
  {
    driverId: uuid("driver_id")
      .primaryKey()
      .references(() => drivers.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    updatedAtIdx: index("driver_heartbeats_updated_at_idx").on(t.updatedAt)
  })
);

/**
 * v1.0.15 — audit trail of every push the SOS cascade engine emitted.
 * One row per (booking, driver) pair, inserted when the cascade pushes to a
 * driver. UPDATE timestamps on accept/reject. Lets admin debug "why didn't
 * driver X get this SOS?" by inspecting wave_number and pushed_at.
 */
export const sosDispatchAttempts = pgTable(
  "sos_dispatch_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .references(() => bookings.id, { onDelete: "cascade" })
      .notNull(),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "cascade" })
      .notNull(),
    waveNumber: integer("wave_number").notNull(),
    distanceKm: doublePrecision("distance_km"),
    pushedAt: timestamp("pushed_at", { withTimezone: true }).defaultNow().notNull(),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
  },
  (t) => ({
    bookingIdx: index("sos_attempts_booking_idx").on(t.bookingId)
  })
);

/**
 * v1.2.0 (CR#2) — driver-initiated cancellation audit log. One row per
 * cancellation the driver confirms from the trip screen. `reasonCode` is one of
 * the patient/vehicle/operational/Other codes; `outcome` is 'RE_DISPATCHED'
 * (vehicle/operational/Other → booking returned to dispatch) or 'CLOSED'
 * (patient-reason → ride cancelled). `driverId` is ON DELETE SET NULL so the
 * audit row survives a driver row deletion.
 */
export const bookingCancellations = pgTable(
  "booking_cancellations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id")
      .references(() => bookings.id, { onDelete: "cascade" })
      .notNull(),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "set null" }),
    reasonCode: text("reason_code").notNull(),
    remarks: text("remarks"),
    outcome: text("outcome").notNull(), // 'RE_DISPATCHED' | 'CLOSED'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    driverIdx: index("booking_cancellations_driver_idx").on(t.driverId),
    bookingIdx: index("booking_cancellations_booking_idx").on(t.bookingId),
    createdAtIdx: index("booking_cancellations_created_at_idx").on(t.createdAt)
  })
);
export type BookingCancellation = typeof bookingCancellations.$inferSelect;

/**
 * v1.2.1 (CR#3) — hospital-raised feedback / issue tickets. A hospital can
 * raise a concern about a DRIVER, a RIDE, or a GENERAL topic from the portal;
 * tickets surface in the admin Help & Support section. All FKs are ON DELETE
 * SET NULL so a ticket survives deletion of its hospital/driver/booking row.
 * `subjectType` is 'DRIVER' | 'RIDE' | 'GENERAL'; `status` is 'OPEN' | 'RESOLVED'.
 * v1.2.2 (CR): `category` splits the one ticket entity into 'FEEDBACK' (soft
 * feedback surfaced in the hospital "Feedbacks" tab) vs 'ISSUE' (actionable
 * items admin resolves, surfaced in "Help & Support"). Defaults to 'ISSUE' so
 * pre-v1.2.2 rows + un-tagged tickets stay in the actionable bucket.
 * v1.2.4 (helpdesk): tickets now arrive from THREE sources — Hospital portal
 * (live), Driver app + User app. `source` ('HOSPITAL'|'DRIVER'|'USER', default
 * 'HOSPITAL' so pre-v1.2.4 rows read correctly) records origin; `raiserUserId`
 * / `raiserDriverId` scope app-raised tickets to their owner (RBAC). `priority`
 * + `severity` are admin-triage flags; `resolvedBy` captures the operator name
 * who closed the ticket (no close without a reply). The to-and-fro chat lives
 * in `supportTicketMessages` (the raiser's first message is also seeded there
 * so the card reads as one conversation).
 */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hospitalId: uuid("hospital_id").references(() => hospitals.id, { onDelete: "set null" }),
    subjectType: text("subject_type").notNull(), // 'DRIVER' | 'RIDE' | 'GENERAL'
    category: text("category").default("ISSUE").notNull(), // 'FEEDBACK' | 'ISSUE'
    // v1.2.4: origin of the ticket. Default 'HOSPITAL' keeps every pre-v1.2.4
    // row (all hospital-raised) reading correctly.
    source: text("source").default("HOSPITAL").notNull(), // 'HOSPITAL' | 'DRIVER' | 'USER'
    // v1.2.4: admin-triage flags. priority drives the colored flag/sort,
    // severity is the impact chip.
    priority: text("priority").default("NORMAL").notNull(), // 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
    severity: text("severity").default("MEDIUM").notNull(), // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
    driverId: uuid("driver_id").references(() => drivers.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    // v1.2.4: who raised an app-sourced ticket. RBAC scopes driver tickets to
    // raiser_driver_id=sub and user tickets to raiser_user_id=sub. ON DELETE
    // SET NULL so a ticket survives deletion of its raiser row.
    raiserUserId: uuid("raiser_user_id").references(() => users.id, { onDelete: "set null" }),
    raiserDriverId: uuid("raiser_driver_id").references(() => drivers.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    status: text("status").default("OPEN").notNull(), // 'OPEN' | 'RESOLVED'
    // v1.2.4: name of the operator who closed the ticket (no close without a
    // reply — captured at resolve time).
    resolvedBy: text("resolved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (t) => ({
    statusIdx: index("support_tickets_status_idx").on(t.status),
    hospitalIdx: index("support_tickets_hospital_idx").on(t.hospitalId),
    createdIdx: index("support_tickets_created_idx").on(t.createdAt)
  })
);
export type SupportTicket = typeof supportTickets.$inferSelect;

/**
 * v1.2.4 (helpdesk) — to-and-fro chat thread on a support ticket. Both sides
 * post: the raiser (HOSPITAL/DRIVER/USER) and the JR admin (ADMIN). The
 * raiser's first message is seeded here at ticket creation so the card reads
 * as one continuous conversation. `authorName` is the display name captured at
 * post time (operator name for admin replies; hospital/driver/user name for
 * raiser posts). FK is ON DELETE CASCADE so a ticket's whole thread is removed
 * with it.
 */
export const supportTicketMessages = pgTable(
  "support_ticket_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .references(() => supportTickets.id, { onDelete: "cascade" })
      .notNull(),
    authorRole: text("author_role").notNull(), // 'ADMIN' | 'HOSPITAL' | 'DRIVER' | 'USER'
    authorName: text("author_name"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    ticketIdx: index("support_ticket_messages_ticket_idx").on(t.ticketId, t.createdAt)
  })
);
export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;

/**
 * v1.3.0 (safety alert) — in-ride panic / duress alerts. Distinct from the
 * patient SOS booking (bookings.isSos + cascade dispatch) and the helpdesk
 * (support_tickets): a time-critical, location-bearing "all hands near here"
 * event raised during an active ride. On raise it pings admin (high priority)
 * plus nearby available drivers with the raiser's live location, in one shot
 * (no cascade waves). `displayId` snapshots the booking's locked #1000xx so
 * the human-facing id stays stable even if the booking row later moves. All
 * FKs are ON DELETE SET NULL so an alert survives deletion of its booking or
 * raiser row. `notifiedDriverIds` records the responder ids pinged on raise so
 * their cards can be cleared on resolve/cancel. `status` is
 * 'ACTIVE' | 'RESOLVED' | 'CANCELLED'.
 */
export const safetyAlerts = pgTable(
  "safety_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    displayId: text("display_id"),
    raiserRole: text("raiser_role").notNull(), // 'USER' | 'DRIVER'
    raiserUserId: uuid("raiser_user_id").references(() => users.id, { onDelete: "set null" }),
    raiserDriverId: uuid("raiser_driver_id").references(() => drivers.id, { onDelete: "set null" }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    note: text("note"),
    notifiedDriverIds: jsonb("notified_driver_ids").default([]).notNull(),
    status: text("status").default("ACTIVE").notNull(), // 'ACTIVE' | 'RESOLVED' | 'CANCELLED'
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    statusIdx: index("safety_alerts_status_idx").on(t.status),
    bookingIdx: index("safety_alerts_booking_idx").on(t.bookingId),
    createdIdx: index("safety_alerts_created_idx").on(t.createdAt)
  })
);
export type SafetyAlert = typeof safetyAlerts.$inferSelect;
export type NewSafetyAlert = typeof safetyAlerts.$inferInsert;

/**
 * v1.3.0 (safety alert) — driver acknowledgements ("I am responding") on a
 * safety alert. One row per (alert, driver) via the UNIQUE(alert_id,
 * driver_id) index; the ack endpoint upserts (idempotent via
 * onConflictDoUpdate). `lat`/`lng` are the responder's position at ack time
 * (nullable). FKs are ON DELETE CASCADE so acks are removed with their alert
 * or driver row.
 */
export const safetyAlertAcks = pgTable(
  "safety_alert_acks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    alertId: uuid("alert_id")
      .references(() => safetyAlerts.id, { onDelete: "cascade" })
      .notNull(),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "cascade" })
      .notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    respondedAt: timestamp("responded_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    alertIdx: index("safety_alert_acks_alert_idx").on(t.alertId),
    alertDriverUniqueIdx: uniqueIndex("safety_alert_acks_alert_driver_unique_idx").on(
      t.alertId,
      t.driverId
    )
  })
);
export type SafetyAlertAck = typeof safetyAlertAcks.$inferSelect;

/**
 * v1.1.0 (CR#3/#6) — destination hospitals. In the current phase there is one
 * active default (SRMS IMS Hospital, Bareilly) that every ride is routed to;
 * the schema supports onboarding more hospitals later (admin CRUD + a future
 * dynamic-assignment step). `isDefault` marks the single auto-assigned row;
 * `active` gates whether it shows in pickers / can be assigned.
 */
export const hospitals = pgTable(
  "hospitals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    address: text("address"),
    city: text("city"),
    phone: text("phone"),
    active: boolean("active").default(true).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    // v1.2.0 (CR#3) — hospital portal credentials. One login per hospital for
    // the pilot. `portalUsername` is unique (case-insensitive uniqueness is
    // enforced by a LOWER() partial index in the bootstrap DDL); the password
    // is stored as a salted scrypt hash. `portalEnabled` gates whether the
    // login is accepted at all.
    portalUsername: text("portal_username").unique(),
    portalPasswordHash: text("portal_password_hash"),
    // v1.2.1 (CR#3) — admin-only recoverable copy of the portal password, for
    // the hospitals-dashboard "view password" display. NEVER returned by the
    // public GET /api/v1/hospitals or any /hospital/* (hospital-JWT) endpoint;
    // only the admin-key GET /admin/hospitals surfaces it (and never the hash).
    portalPasswordPlain: text("portal_password_plain"),
    portalEnabled: boolean("portal_enabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    activeIdx: index("hospitals_active_idx").on(t.active)
  })
);

export type Hospital = typeof hospitals.$inferSelect;
export type NewHospital = typeof hospitals.$inferInsert;

/**
 * v1.1.2 — driver↔hospital assignment (many-to-many). A driver can be
 * assigned to multiple hospitals; exactly one is `isPrimary` (mirrored to
 * drivers.hospitalId/hospitalName for the app + dispatch). Admin manages this
 * from the driver/hospital detail pages; KYC seeds a single primary row.
 */
export const driverHospitals = pgTable(
  "driver_hospitals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "cascade" })
      .notNull(),
    hospitalId: uuid("hospital_id")
      .references(() => hospitals.id, { onDelete: "cascade" })
      .notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (t) => ({
    driverIdx: index("driver_hospitals_driver_idx").on(t.driverId),
    hospitalIdx: index("driver_hospitals_hospital_idx").on(t.hospitalId)
  })
);

export type DriverHospital = typeof driverHospitals.$inferSelect;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingEvent = typeof bookingEvents.$inferSelect;
export type DriverLocation = typeof driverLocations.$inferSelect;
export type DriverHeartbeat = typeof driverHeartbeats.$inferSelect;
export type SosDispatchAttempt = typeof sosDispatchAttempts.$inferSelect;
export type SystemEvent = typeof systemEvents.$inferSelect;
export type NewSystemEvent = typeof systemEvents.$inferInsert;
