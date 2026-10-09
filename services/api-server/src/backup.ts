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

function getAuth(): GoogleAuth {
  const raw = process.env.DRIVE_SA_JSON;
  if (!raw) throw new Error("DRIVE_SA_JSON missing: database backup unavailable");
  return new GoogleAuth({ credentials: JSON.parse(raw), scopes: [DRIVE_SCOPE] });
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

/** One repeatable-read snapshot keeps related rows consistent during live writes. */
export async function buildDatabaseSnapshot() {
  return pgClient.begin("isolation level repeatable read read only", async tx => {
    const dump: { takenAt: string; formatVersion: number; tables: Record<string, unknown[]> } = {
      takenAt: new Date().toISOString(), formatVersion: 2, tables: {}
    };
    const tables = await tx`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    for (const { tablename } of tables) {
      const rows = await tx.unsafe(`SELECT * FROM "${String(tablename).replace(/"/g, '""')}"`);
      dump.tables[tablename] = rows.map(serializeRow);
    }
    return dump;
  });
}
let running = false;
export async function runDatabaseBackup(): Promise<void> {
  if (running) throw new Error("database backup already running");
  running = true;
  try {
  const auth = getAuth();
  const dump = await buildDatabaseSnapshot();

  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;
  if (!token) throw new Error("Drive backup access token unavailable");

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
      signal: AbortSignal.timeout(120_000),
      body: multipart
    }
  );
  if (!res.ok) {
    throw new Error(`Drive backup upload failed: HTTP ${res.status}`);
  }
  console.log(`[backup] wrote ${name} (${(body.length / 1024).toFixed(0)}KB)`);
  } finally { running = false; }
}
