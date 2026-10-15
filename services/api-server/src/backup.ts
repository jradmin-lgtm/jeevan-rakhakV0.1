import { GoogleAuth } from "google-auth-library";
import { createHash } from "node:crypto";
import { sql as pgClient } from "@jr/db";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const BACKUP_FOLDER_ID = process.env.DB_BACKUP_FOLDER_ID || "1zjoheWt2K7GP3v_-AUetnbCKBFq11H7G";
export const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
type Snapshot = { takenAt: string; formatVersion: number; tables: Record<string, Record<string, unknown>[]> };
type BackupFile = { id: string; createdTime: string; appProperties?: Record<string, string> };
const blobCache = new Map<string, string>();
let cacheLoaded = false;
let lastSuccessfulAt = 0;
// Single API writer: simultaneous blue-green workers can still upload two due snapshots.
// Multi-writer deployment requires a durable distributed lease; session locks are unsafe through transaction pooling.
let running = false;

function sourceIdentity(): string {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing: backup source cannot be identified");
  const url = new URL(process.env.DATABASE_URL);
  return createHash("sha256").update(`${url.username}@${url.hostname.toLowerCase()}:${url.port || '5432'}${url.pathname}`).digest("hex");
}
function getAuth(): GoogleAuth {
  const raw = process.env.DRIVE_SA_JSON;
  if (!raw) throw new Error("DRIVE_SA_JSON missing: database backup unavailable");
  return new GoogleAuth({ credentials: JSON.parse(raw), scopes: [DRIVE_SCOPE] });
}
function cacheKey(bytes: Buffer): string {
  return `${createHash("sha256").update(bytes).digest("hex")}:${bytes.length}`;
}
export function cacheSnapshotBlobs(snapshot: unknown, cache: Map<string, string>): void {
  const value = snapshot as Snapshot;
  if (!value || value.formatVersion !== 2 || !Number.isFinite(Date.parse(value.takenAt)) || !value.tables || Array.isArray(value.tables)) {
    throw new Error("Previous Drive backup is not a valid formatVersion 2 snapshot");
  }
  for (const rows of Object.values(value.tables)) {
    if (!Array.isArray(rows)) throw new Error("Previous Drive backup has an invalid table");
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Previous Drive backup has an invalid row");
      for (const field of Object.values(row)) {
        if (field && typeof field === "object" && "__bytea__" in field) {
          const encoded = (field as { __bytea__: unknown }).__bytea__;
          if (typeof encoded !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
            throw new Error("Previous Drive backup contains invalid document bytes");
          }
          const bytes = Buffer.from(encoded, "base64");
          if (bytes.toString("base64") !== encoded) throw new Error("Previous Drive backup document encoding is not canonical");
          cache.set(cacheKey(bytes), encoded);
        }
      }
    }
  }
}
function identifier(value: string): string { return `"${value.replace(/"/g, '""')}"`; }
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    Buffer.isBuffer(value) ? { __bytea__: value.toString("base64") } : value instanceof Date ? value.toISOString() : value]));
}

/** Every snapshot remains complete. Only unchanged binary reads are reused. */
export async function buildDatabaseSnapshot(cache = blobCache): Promise<Snapshot> {
  return pgClient.begin("isolation level repeatable read read only", async tx => {
    const dump: Snapshot = { takenAt: new Date().toISOString(), formatVersion: 2, tables: {} };
    const startedAt = Date.now();
    let reusedBytes = 0, fetchedBytes = 0, hits = 0, misses = 0;
    const tables = await tx`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    for (const { tablename } of tables) {
      const columns = await tx`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tablename} ORDER BY ordinal_position`;
      const blobs = columns.filter(c => c.data_type === "bytea");
      if (!blobs.length) {
        dump.tables[tablename] = (await tx.unsafe(`SELECT * FROM ${identifier(tablename)}`)).map(serializeRow);
        continue;
      }
      const prefix = "__jr_backup_";
      if (columns.some(c => c.column_name.startsWith(prefix))) throw new Error(`Backup metadata column collision in ${tablename}`);
      const projection = columns.filter(c => c.data_type !== "bytea").map(c => identifier(c.column_name));
      projection.push(`ctid::text AS "${prefix}ctid"`);
      blobs.forEach((c, i) => projection.push(`encode(sha256(${identifier(c.column_name)}),'hex') AS "${prefix}hash${i}"`, `octet_length(${identifier(c.column_name)}) AS "${prefix}len${i}"`));
      const rows = await tx.unsafe(`SELECT ${projection.join(',')} FROM ${identifier(tablename)}`);
      const serialized: Record<string, unknown>[] = [];
      for (const row of rows) {
        const out = serializeRow(row);
        for (let i = 0; i < blobs.length; i++) {
          const hash = row[`${prefix}hash${i}`], length = row[`${prefix}len${i}`];
          const field = blobs[i].column_name;
          if (hash === null && length === null) { out[field] = null; continue; }
          if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash) || !Number.isSafeInteger(length) || length < 0) throw new Error(`Invalid backup document metadata in ${tablename}`);
          const key = `${hash}:${length}`;
          let encoded = cache.get(key);
          if (encoded === undefined) {
            const [fresh] = await tx.unsafe(`SELECT encode(${identifier(field)},'base64') AS encoded FROM ${identifier(tablename)} WHERE ctid = $1::tid`, [row[`${prefix}ctid`]]);
            if (!fresh || typeof fresh.encoded !== "string") throw new Error(`Backup document disappeared from repeatable-read snapshot in ${tablename}`);
            encoded = fresh.encoded.replace(/\n/g, "");
            const bytes = Buffer.from(encoded, "base64");
            if (cacheKey(bytes) !== key) throw new Error(`Backup document checksum mismatch in ${tablename}`);
            cache.set(key, encoded); fetchedBytes += length; misses++;
          } else {
            const cachedBytes = Buffer.from(encoded, "base64");
            if (cachedBytes.toString("base64") !== encoded || cacheKey(cachedBytes) !== key) throw new Error(`Backup document cache checksum mismatch in ${tablename}`);
            reusedBytes += length; hits++;
          }
          out[field] = { __bytea__: encoded };
        }
        for (const key of Object.keys(out)) if (key.startsWith(prefix)) delete out[key];
        serialized.push(out);
      }
      dump.tables[tablename] = serialized;
    }
    console.log(JSON.stringify({ event: "backup.snapshot", binarySourceBytesFetched: fetchedBytes, binarySourceBytesReused: reusedBytes, cacheHits: hits, cacheMisses: misses, estimatedBinaryWireBytes: Math.ceil(fetchedBytes / 3) * 4, wireBytesMeasured: false, tables: tables.length, durationMs: Date.now() - startedAt }));
    return dump;
  });
}
async function driveRequest(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Drive backup request failed: HTTP ${response.status}`);
  return response;
}
async function latestBackup(token: string, source?: string): Promise<BackupFile | null> {
  const params = new URLSearchParams({
    q: `'${BACKUP_FOLDER_ID.replace(/'/g, "\\'")}' in parents and trashed=false and name contains 'jr-db-backup-'${source ? ` and appProperties has { key='jrBackupSource' and value='${source}' }` : ''}`,
    supportsAllDrives: "true", includeItemsFromAllDrives: "true", corpora: "allDrives", orderBy: "createdTime desc", pageSize: "1", fields: "files(id,createdTime,appProperties)"
  });
  const result = await (await driveRequest(token, `https://www.googleapis.com/drive/v3/files?${params}`)).json() as { files?: BackupFile[] };
  if (!Array.isArray(result.files)) throw new Error("Drive backup listing has no files array");
  return result.files[0] ?? null;
}
/** Force bypasses the durable cooldown for explicit operator backups. */
export async function runDatabaseBackup(options: { force?: boolean } = {}): Promise<void> {
  if (running) throw new Error("database backup already running");
  running = true;
  try {
    const source = sourceIdentity();
    const client = await getAuth().getClient();
    const token = (await client.getAccessToken()).token;
    if (!token) throw new Error("Drive backup access token unavailable");
    const previous = await latestBackup(token, source);
    if (previous) {
      const at = Date.parse(previous.appProperties?.jrBackupTakenAt ?? previous.createdTime);
      if (!Number.isFinite(at) || at > Date.now() + 60_000) throw new Error("Drive backup timestamp is invalid");
      lastSuccessfulAt = Math.max(lastSuccessfulAt, at);
      if (!options.force && Date.now() - at < BACKUP_INTERVAL_MS) {
        console.log(`[backup] recent source-matched snapshot exists; next due in ${Math.ceil((BACKUP_INTERVAL_MS - (Date.now() - at)) / 60000)} minutes`);
        return;
      }
    }
    if (!cacheLoaded) {
      const seed = previous ?? await latestBackup(token);
      if (seed) {
        const snapshot = await (await driveRequest(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(seed.id)}?alt=media&supportsAllDrives=true`)).json();
        cacheSnapshotBlobs(snapshot, blobCache);
      }
      cacheLoaded = true;
    }
    const dump = await buildDatabaseSnapshot();
    const name = `jr-db-backup-${dump.takenAt.replace(/[:.]/g, "-")}.json`;
    const metadata = JSON.stringify({ name, parents: [BACKUP_FOLDER_ID], appProperties: { jrBackupSource: source, jrBackupTakenAt: dump.takenAt } });
    const body = JSON.stringify(dump), boundary = "jr_backup_boundary_7e2";
    const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
    await driveRequest(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
      method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart
    });
    lastSuccessfulAt = Date.parse(dump.takenAt);
    // Bound cache memory to one complete snapshot, including only currently referenced bytes.
    const current = new Map<string, string>(); cacheSnapshotBlobs(dump, current); blobCache.clear();
    for (const [key, value] of current) blobCache.set(key, value);
    console.log(JSON.stringify({ event: "backup.uploaded", name, snapshotJsonBytes: Buffer.byteLength(body), lastSuccessfulAt: new Date(lastSuccessfulAt).toISOString(), nextDueAt: new Date(lastSuccessfulAt + BACKUP_INTERVAL_MS).toISOString() }));
  } finally { running = false; }
}
/** Restart cooldown never delays the next backup beyond its six-hour due time. */
export function startDatabaseBackups(onError: (error: unknown) => void): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    let failed = false;
    try { await runDatabaseBackup(); } catch (error) { failed = true; onError(error); }
    if (!stopped) {
      timer = setTimeout(() => { void tick(); }, failed ? 300_000 : Math.max(1000, BACKUP_INTERVAL_MS - (Date.now() - lastSuccessfulAt)));
      timer.unref();
    }
  };
  void tick();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
