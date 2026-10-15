import { sql } from "./client";

export async function applyFeedbackMigration() {
  await sql.begin(async tx => {
    await tx`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS admin_offline boolean NOT NULL DEFAULT false`;
    await tx`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS push_alert_protocol integer NOT NULL DEFAULT 1`;
    await tx`CREATE TABLE IF NOT EXISTS admin_actions (
      id uuid PRIMARY KEY, action text NOT NULL, target_id uuid NOT NULL,
      reason text NOT NULL, request_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await tx`CREATE INDEX IF NOT EXISTS admin_actions_target_idx ON admin_actions(target_id,created_at)`;
  });
}
