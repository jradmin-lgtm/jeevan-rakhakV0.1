/**
 * backup.ts — periodic full-database backup to Drive.
 *
 * 2026-08-11: added after a migration bug took the backend down for ~2
 * minutes during real driver/user trial (see main.ts DDL comment + CONTEXT.md
 * 0-OPS #12). That incident was an outage, not data loss, but it's exactly
 * the kind of live-trial scare that makes "do we actually have a backup"
 * the next obvious question — this answers it. Dumps every operational
 * table (not just schema) as JSON, uploaded to a PRIVATE Drive folder
 * (separate from the public APK distribution folder). Never touches Neon
 * itself — this is an independent copy, so it survives even if Neon's own
 * point-in-time-restore window (6h on Free) has already passed.
 *
 * Reuses DRIVE_SA_JSON (already configured for the download portal) but
 * needs the FULL `drive` scope, not `drive.readonly` — a separate GoogleAuth
 * instance from drive.ts, which is deliberately read-only for the app-store
 * download path.
 */
import { GoogleAuth } from "google-auth-library";
import { sql as pgClient } from "@jr/db";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
// "DB Backups (private, not for distribution)" — a subfolder of the same
// Shared Drive used for APK distribution (no separate Drive available to
// this service account), but a distinct folder id so it's never listed
// alongside the public-facing APK files.
const BACKUP_FOLDER_ID = process.env.DB_BACKUP_FOLDER_ID || "1zjoheWt2K7GP3v_-AUetnbCKBFq11H7G";

// Every operational table. Deliberately excludes nothing — driver_documents'
// bytea column IS included (base64-encoded below) so a real KYC photo isn't
// a re-upload-only recovery path. hospitals is included too even though it's
// rarely edited; a full backup should mean full, not "everything except the
// one table we assumed was safe" — the driver_documents outage above was
// exactly a case of an assumption like that turning out wrong later.
const BACKUP_TABLES = [
  "hospitals", "users", "drivers", "driver_hospitals", "driver_documents",
  "driver_document_updates", "bookings", "booking_events",
  "booking_cancellations", "sos_dispatch_attempts", "safety_alerts",
  "safety_alert_acks", "support_tickets", "support_ticket_messages",
  "otp_codes", "driver_heartbeats", "driver_locations", "system_events",
  "app_events"
];

let _auth: GoogleAuth | null = null;
let _tried = false;

function getAuth(): GoogleAuth | null {
  if (!_tried) {
    _tried = true;
    const raw = process.env.DRIVE_SA_JSON;
    if (raw) {
      try {
        _auth = new GoogleAuth({ credentials: JSON.parse(raw), scopes: [DRIVE_SCOPE] });
      } catch (err) {
        console.warn("[backup] DRIVE_SA_JSON parse failed — DB backups disabled", err);
      }
    }
  }
  return _auth;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (Buffer.isBuffer(v)) out[k] = { __bytea__: (v as Buffer).toString("base64") };
    else if (v instanceof Date) out[k] = v.toISOString();
    else out[k] = v;
  }
  return out;
}

/** Dump every table to one JSON blob and upload it to the private backup folder. */
export async function runDatabaseBackup(): Promise<void> {
  const auth = getAuth();
  if (!auth) return; // DRIVE_SA_JSON unset — no-op, same fail-open convention as drive.ts

  const dump: { takenAt: string; tables: Record<string, unknown[]> } = {
    takenAt: new Date().toISOString(),
    tables: {}
  };
  for (const t of BACKUP_TABLES) {
    const rows = await pgClient.unsafe(`SELECT * FROM ${t}`);
    dump.tables[t] = rows.map(serializeRow);
  }

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) return;

  const name = `jr-db-backup-${dump.takenAt.replace(/[:.]/g, "-")}.json`;
  const metadata = JSON.stringify({ name, parents: [BACKUP_FOLDER_ID] });
  const body = JSON.stringify(dump);
  const boundary = "jr_backup_boundary_7e2";
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}` +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipart
    }
  );
  if (!res.ok) {
    console.warn("[backup] Drive upload failed", res.status, (await res.text()).slice(0, 300));
    return;
  }
  console.log(`[backup] wrote ${name} (${(body.length / 1024).toFixed(0)}KB)`);
}
