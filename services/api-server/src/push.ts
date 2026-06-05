/**
 * v1.1.0 — push notifications via FCM HTTP v1.
 *
 * Sends to a device's FCM token so patients/drivers get woken even when the
 * app is backgrounded or killed (the Uber/Swiggy pattern). Uses
 * `google-auth-library` (already a dependency for Google Sign-In) to mint an
 * OAuth token from the FCM service account — no Firebase Admin SDK, no Expo
 * relay, no new dependency.
 *
 * Config: set `FCM_SERVICE_ACCOUNT_JSON` on Render to the full contents of the
 * Firebase service-account key (the file from Project Settings → Service
 * accounts → Generate new private key). If the env var is absent, every send
 * is a silent no-op — so this is safe to ship before FCM is configured.
 *
 * All sends are best-effort and fire-and-forget: a push failure must NEVER
 * break a booking/dispatch request, so callers `void` these and we swallow
 * errors here.
 */
import { GoogleAuth } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db, drivers, users } from "@jr/db";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

let _auth: GoogleAuth | null = null;
let _projectId: string | null = null;
let _initTried = false;

function getAuth(): { auth: GoogleAuth; projectId: string } | null {
  if (!_initTried) {
    _initTried = true;
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (raw) {
      try {
        const creds = JSON.parse(raw);
        _projectId = creds.project_id;
        _auth = new GoogleAuth({ credentials: creds, scopes: [FCM_SCOPE] });
      } catch (err) {
        console.warn("[push] FCM_SERVICE_ACCOUNT_JSON parse failed — push disabled", err);
      }
    }
  }
  return _auth && _projectId ? { auth: _auth, projectId: _projectId } : null;
}

/** Low-level: send to one FCM token. No-op if push isn't configured / no token. */
export async function sendPush(
  token: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  if (!token) return;
  const a = getAuth();
  if (!a) return; // FCM not configured yet — silent no-op
  try {
    const client = await a.auth.getClient();
    const accessToken = (await client.getAccessToken()).token;
    if (!accessToken) return;
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${a.projectId}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: data ?? {},
            android: { priority: "HIGH", notification: { sound: "default" } }
          }
        })
      }
    );
    if (!res.ok) {
      console.warn("[push] FCM send failed", res.status, (await res.text()).slice(0, 200));
    }
  } catch (err) {
    console.warn("[push] send error", err);
  }
}

/** Convenience: look up a user's token + send. Fire-and-forget. */
export async function pushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const [u] = await db.select({ t: users.pushToken }).from(users).where(eq(users.id, userId)).limit(1);
    await sendPush(u?.t, title, body, data);
  } catch {
    /* swallow */
  }
}

/** Convenience: look up a driver's token + send. Fire-and-forget. */
export async function pushToDriver(
  driverId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const [d] = await db.select({ t: drivers.pushToken }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
    await sendPush(d?.t, title, body, data);
  } catch {
    /* swallow */
  }
}
