/**
 * drive.ts — read the public APK folder via the Drive service account
 * (jeevan-rakshak@…d3f52). Reuses google-auth-library (already a dep for FCM).
 *
 * Resolves the latest user/driver APK and streams its bytes. The APK files stay
 * private (SA-only) — the download is gated by a server-issued one-time token in
 * routes/download.ts, so there are no anonymous downloads.
 *
 * Config (env): DRIVE_SA_JSON = the SA key JSON (string); DRIVE_FOLDER_ID =
 * the PUBLIC APK Shared-Drive folder id (defaults baked). If DRIVE_SA_JSON is
 * unset, downloads are disabled (endpoints return 503) — never crashes the app.
 */
import { GoogleAuth } from "google-auth-library";
import { Readable } from "node:stream";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FOLDER_ID = process.env.DRIVE_FOLDER_ID || "0AMCAe2CcITBfUk9PVA";

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
        console.warn("[drive] DRIVE_SA_JSON parse failed — downloads disabled", err);
      }
    }
  }
  return _auth;
}

export function driveConfigured(): boolean {
  return getAuth() !== null;
}

async function accessToken(): Promise<string | null> {
  const auth = getAuth();
  if (!auth) return null;
  const client = await auth.getClient();
  return (await client.getAccessToken()).token ?? null;
}

export type ApkFile = { id: string; name: string; size?: string };

/** Newest .apk in the folder whose name starts with jeevan-rakshak-<app>- . */
export async function resolveLatestApk(app: "user" | "driver"): Promise<ApkFile | null> {
  const t = await accessToken();
  if (!t) return null;
  const params = new URLSearchParams({
    q: `'${FOLDER_ID}' in parents and trashed = false and name contains 'jeevan-rakshak-${app}-'`,
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
    orderBy: "modifiedTime desc",
    fields: "files(id,name,size)",
    pageSize: "20",
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!r.ok) {
    console.warn("[drive] list failed", r.status, await r.text().catch(() => ""));
    return null;
  }
  const data: any = await r.json();
  const files: any[] = (data.files || []).filter(
    (f: any) => typeof f.name === "string" && f.name.endsWith(".apk")
  );
  return files.length ? { id: files[0].id, name: files[0].name, size: files[0].size } : null;
}

/** Open the APK bytes as a Node Readable (+ content-length) for streaming. */
export async function openApkStream(
  fileId: string
): Promise<{ body: Readable; contentLength: string | null } | null> {
  const t = await accessToken();
  if (!t) return null;
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${t}` } }
  );
  if (!r.ok || !r.body) {
    console.warn("[drive] media fetch failed", r.status);
    return null;
  }
  return { body: Readable.fromWeb(r.body as any), contentLength: r.headers.get("content-length") };
}
