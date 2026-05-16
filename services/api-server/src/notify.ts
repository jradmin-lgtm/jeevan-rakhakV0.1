/**
 * Out-of-band admin notifications via Resend.
 *
 * Two hooks share this module:
 *  - emitEvent() (events.ts) escalates any event with level=critical|error
 *    via notifyAdmin().
 *  - The Fastify error handler in main.ts also calls notifyAdmin() directly
 *    on unhandled 500-class errors so we don't lose them if DB-write fails.
 *
 * Config:
 *   RESEND_API_KEY    — Resend API key (free tier: 3000/mo). When absent we
 *                        no-op + console.warn so dev/local doesn't fail.
 *   ALERT_EMAIL_TO    — recipient. Defaults to jradmin@jeevan-rakshak.com.
 *   ALERT_EMAIL_FROM  — sender. Defaults to alerts@jeevan-rakshak.com (must
 *                        be verified on Resend before sending; until then,
 *                        use Resend's onboarding sandbox address).
 */

const TO_DEFAULT = "jradmin@jeevan-rakshak.com";
const FROM_DEFAULT = "Jeevan Rakshak Alerts <onboarding@resend.dev>";

// In-process throttle so a hot crash loop doesn't burn through our monthly
// email quota. Same subject + ~10 min window = collapsed.
const recentSubjects = new Map<string, number>();
const THROTTLE_MS = 10 * 60 * 1000;

export async function notifyAdmin(subject: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Dev/local — don't fail, just trace.
    // eslint-disable-next-line no-console
    console.warn("[notify] RESEND_API_KEY missing — skipping email:", subject);
    return;
  }
  const now = Date.now();
  const last = recentSubjects.get(subject);
  if (last && now - last < THROTTLE_MS) {
    return; // already alerted in the last 10 min
  }
  recentSubjects.set(subject, now);

  const to = process.env.ALERT_EMAIL_TO ?? TO_DEFAULT;
  const from = process.env.ALERT_EMAIL_FROM ?? FROM_DEFAULT;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to,
        subject: `[JR PROD] ${subject}`,
        text: body
      })
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[notify] resend rejected:", res.status, await res.text());
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[notify] send threw:", err);
  }
}
