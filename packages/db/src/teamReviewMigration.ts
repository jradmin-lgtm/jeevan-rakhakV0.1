import { sql } from "./client";

export async function applyTeamReviewMigration() {
  await sql.begin(async tx => {
    await tx`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz`;
    const [legacy] = await tx`SELECT to_regclass('booking_cancellations') IS NOT NULL AS exists`;
    if (legacy.exists) {
      await tx`UPDATE bookings b SET dispatch_started_at = COALESCE((SELECT MAX(c.created_at) FROM booking_cancellations c WHERE c.booking_id = b.id AND c.outcome = 'RE_DISPATCHED'), b.created_at) WHERE dispatch_started_at IS NULL`;
    } else {
      // A fresh foundational schema has no cancellation history to recover.
      await tx`UPDATE bookings SET dispatch_started_at = created_at WHERE dispatch_started_at IS NULL`;
    }
    await tx`ALTER TABLE bookings ALTER COLUMN dispatch_started_at SET DEFAULT now()`;
    await tx`ALTER TABLE bookings ALTER COLUMN dispatch_started_at SET NOT NULL`;
    await tx`CREATE TABLE IF NOT EXISTS ui_events (
      id uuid PRIMARY KEY, actor_id uuid NOT NULL, role text NOT NULL CHECK (role IN ('user','driver')),
      event text NOT NULL, captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now()
    )`;
    await tx`CREATE INDEX IF NOT EXISTS ui_events_received_idx ON ui_events(received_at)`;
    await tx`CREATE INDEX IF NOT EXISTS ui_events_event_received_idx ON ui_events(event,received_at)`;
  });
}
