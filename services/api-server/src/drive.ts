/**
 * Google Drive APK metadata and delivery.
 * Proxy mode streams private APK files. Drive mode verifies explicitly
 * link-readable release files and returns an anonymous browser download URL.
 * The portal retains contact collection; copied public links can bypass it.
 * Service-account credentials never enter the redirect URL.
 */
import { GoogleAuth } from "google-auth-library";
import { Readable } from "node:stream";
import { resolveDirectApk } from "./directApkDownload";

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

/** Read-only metadata/anonymous prefix checks; APK payload never proxies through Render. */
export async function resolveDirectApkLink(apk: ApkFile): Promise<string> {
  const token = await accessToken();
  if (!token) throw new Error("Drive account is unavailable");
  const query = new URLSearchParams({ supportsAllDrives: "true", fields: "id,size,mimeType,capabilities(canDownload),permissions(type,role)" });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(apk.id)}?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`APK permission verification failed: HTTP ${response.status}`); }
  const file = await response.json() as { id: string; size: string; capabilities?: { canDownload?: boolean }; permissions?: { type: string; role: string }[] };
  if (file.id !== apk.id || file.size !== apk.size || !file.capabilities?.canDownload) throw new Error("The selected APK identity, size or download access changed");
  let permissions = file.permissions;
  if (!permissions) {
    const query = new URLSearchParams({ supportsAllDrives: "true", pageSize: "100", fields: "permissions(type,role),nextPageToken" });
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/permissions?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`APK access listing failed: HTTP ${response.status}`); }
    const result = await response.json() as { permissions?: { type: string; role: string }[]; nextPageToken?: string };
    if (!Array.isArray(result.permissions) || result.nextPageToken) throw new Error("APK access listing is incomplete");
    permissions = result.permissions;
  }
  if (!permissions.some(p => p.type === "anyone" && p.role === "reader")) throw new Error("The selected APK is not explicitly link-readable");
  return resolveDirectApk(file.id, Number(file.size));
}
