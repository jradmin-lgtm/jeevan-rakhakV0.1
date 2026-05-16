import { sql } from "./client";

const ddl = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE emergency_type AS ENUM (
    'ACCIDENT_TRAUMA','CARDIAC','BREATHING_DISTRESS','PREGNANCY_NEONATAL','GENERAL_CRITICAL_TRANSFER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM (
    'REQUESTED','ACCEPTED','ARRIVED','PICKED_UP','COMPLETED','CANCELLED','TIMED_OUT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE driver_status AS ENUM ('OFFLINE','AVAILABLE','ON_TRIP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  blood_group text,
  allergies text,
  emergency_contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_phone_idx ON users(phone);

CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  license_number text,
  vehicle_number text,
  vehicle_type text DEFAULT 'BLS',
  status driver_status NOT NULL DEFAULT 'OFFLINE',
  kyc_verified boolean NOT NULL DEFAULT false,
  rating double precision NOT NULL DEFAULT 5.0,
  last_lat double precision,
  last_lng double precision,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drivers_phone_idx ON drivers(phone);
CREATE INDEX IF NOT EXISTS drivers_status_idx ON drivers(status);

CREATE TABLE IF NOT EXISTS otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  role text NOT NULL,
  code text NOT NULL,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_phone_role_idx ON otp_codes(phone, role);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  emergency_type emergency_type NOT NULL,
  status booking_status NOT NULL DEFAULT 'REQUESTED',
  pickup_lat double precision NOT NULL,
  pickup_lng double precision NOT NULL,
  pickup_address text,
  drop_lat double precision,
  drop_lng double precision,
  drop_address text,
  fare_estimate_inr integer,
  fare_final_inr integer,
  rating integer,
  feedback text,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  arrived_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz
);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings(user_id);
CREATE INDEX IF NOT EXISTS bookings_driver_idx ON bookings(driver_id);
CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings(created_at);

CREATE TABLE IF NOT EXISTS booking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  actor text NOT NULL,
  type text NOT NULL,
  payload_json text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_events_booking_idx ON booking_events(booking_id);

CREATE TABLE IF NOT EXISTS driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  speed_kmh double precision,
  heading_deg double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_locations_driver_idx ON driver_locations(driver_id);
CREATE INDEX IF NOT EXISTS driver_locations_booking_idx ON driver_locations(booking_id);

-- is_demo flag — added in v0.3 so admin can filter seed/demo data away from real
-- traffic during the 30-day pilot. Real bookings created via the API default to
-- false; the seed script flips this to true for everything it inserts.
ALTER TABLE users    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS users_is_demo_idx    ON users(is_demo);
CREATE INDEX IF NOT EXISTS drivers_is_demo_idx  ON drivers(is_demo);
CREATE INDEX IF NOT EXISTS bookings_is_demo_idx ON bookings(is_demo);

-- system_events — observability stream. Retained 7 days by a cron in
-- services/api-server. Source values seen so far: api, socket, worker,
-- mobile-user, mobile-driver. level is one of: info, warn, error, critical.
-- The notified column flips to true once notifyAdmin() has emailed the row,
-- so a retry won't re-spam jradmin@jeevan-rakshak.com.
CREATE TABLE IF NOT EXISTS system_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL,
  source text NOT NULL,
  message text NOT NULL,
  context jsonb,
  notified boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS system_events_ts_idx ON system_events(ts DESC);
CREATE INDEX IF NOT EXISTS system_events_level_idx ON system_events(level);
`;

async function main() {
  console.log("[migrate] applying schema...");
  await sql.unsafe(ddl);
  console.log("[migrate] done.");
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
