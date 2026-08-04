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
import { renderPushTemplate, type PushTemplateKey } from "./push-i18n";

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
  data?: Record<string, string>,
  channelId?: string
): Promise<void> {
  if (!token) return;
  const a = getAuth();
  if (!a) return; // FCM not configured yet — silent no-op
  try {
    const client = await a.auth.getClient();
    const accessToken = (await client.getAccessToken()).token;
    if (!accessToken) return;
    // v1.2.8: tag every ride/SOS push by bookingId so (a) successive pushes for
    // the SAME booking COLLAPSE in the tray instead of stacking and (b) a later
    // data-only dismiss can target this exact tray notification and clear it.
    // The bookingId always rides in `data` from the callers; we promote it onto
    // android.collapseKey + android.notification.tag. Always include bookingId
    // in the data payload too (defensive — it's the dismiss/collapse key).
    const bookingId = data?.bookingId;
    const payloadData = bookingId ? { ...data, bookingId } : data ?? {};
    // CR2 (2026-08): channelId routes the push to a native Android channel
    // (sos_alerts / booking_alerts, created in MainApplication.kt) so SOS vs
    // normal requests ring with a different, already-on-the-device sound
    // (alarm tone vs notification tone) instead of both using "default".
    const android: Record<string, unknown> = {
      priority: "HIGH",
      notification: {
        sound: "default",
        ...(bookingId ? { tag: bookingId } : {}),
        ...(channelId ? { channel_id: channelId } : {})
      }
    };
    if (bookingId) android.collapseKey = bookingId;
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${a.projectId}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: payloadData,
            android
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

/**
 * v1.2.8: silent tray-clear. Sends a DATA-ONLY FCM message (NO `notification`
 * block) carrying { type: "dismiss", bookingId } plus the same
 * collapseKey/notification.tag the original ride/SOS push used. The app's
 * background data handler reads type=="dismiss" and cancels the tray
 * notification with that tag, so a request that died (accepted by another
 * driver, cancelled, completed, timed-out) stops ringing/visible without the
 * driver/patient having to tap it. HIGH priority so it wakes a dozing app.
 * No-op when FCM is unset — mirrors sendPush so it's safe before FCM config.
 */
export async function dismissPush(
  token: string | null | undefined,
  bookingId: string
): Promise<void> {
  if (!token || !bookingId) return;
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
            // TRUE data-only: NO `notification` block anywhere (not top-level,
            // not under android) — otherwise FCM classifies it as a display
            // message and, when the app is backgrounded, handles it itself
            // (shows/updates a notification) instead of delivering the data to
            // our background handler. The app finds the target tray entry by
            // the `bookingId` in `data` (the original push set its tag=bookingId).
            // collapseKey is fine (it's not a notification block) and lets this
            // supersede a still-queued duplicate of the same booking.
            data: { type: "dismiss", bookingId },
            android: {
              priority: "HIGH",
              collapseKey: bookingId
            }
          }
        })
      }
    );
    if (!res.ok) {
      console.warn("[push] FCM dismiss failed", res.status, (await res.text()).slice(0, 200));
    }
  } catch (err) {
    console.warn("[push] dismiss error", err);
  }
}

/**
 * Convenience: look up a user's token + preferredLang, render the localized
 * template, and send. Fire-and-forget.
 *
 * CR3/CR4 (2026-08): `key`/`vars` replace the old raw (title, body) params so
 * every push string is localized via push-i18n.ts instead of hardcoded
 * English at the call site.
 */
export async function pushToUser(
  userId: string,
  key: PushTemplateKey,
  vars: Record<string, string | number> = {},
  data?: Record<string, string>
): Promise<void> {
  try {
    const [u] = await db
      .select({ t: users.pushToken, lang: users.preferredLang })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const { title, body } = renderPushTemplate(key, u?.lang, vars);
    await sendPush(u?.t, title, body, data);
  } catch {
    /* swallow */
  }
}

/** Convenience: look up a driver's token + preferredLang, render, and send. */
export async function pushToDriver(
  driverId: string,
  key: PushTemplateKey,
  vars: Record<string, string | number> = {},
  data?: Record<string, string>,
  channelId?: string
): Promise<void> {
  try {
    const [d] = await db
      .select({ t: drivers.pushToken, lang: drivers.preferredLang })
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);
    const { title, body } = renderPushTemplate(key, d?.lang, vars);
    await sendPush(d?.t, title, body, data, channelId);
  } catch {
    /* swallow */
  }
}

/**
 * v1.2.8: silently clear a user's tray notification for a dead booking.
 * Looks up the user's token + fires a data-only dismiss. Fire-and-forget.
 */
export async function dismissPushToUser(userId: string, bookingId: string): Promise<void> {
  try {
    const [u] = await db.select({ t: users.pushToken }).from(users).where(eq(users.id, userId)).limit(1);
    await dismissPush(u?.t, bookingId);
  } catch {
    /* swallow */
  }
}

/**
 * v1.2.8: silently clear a driver's tray notification for a dead booking.
 * Looks up the driver's token + fires a data-only dismiss. Fire-and-forget.
 */
export async function dismissPushToDriver(driverId: string, bookingId: string): Promise<void> {
  try {
    const [d] = await db.select({ t: drivers.pushToken }).from(drivers).where(eq(drivers.id, driverId)).limit(1);
    await dismissPush(d?.t, bookingId);
  } catch {
    /* swallow */
  }
}
