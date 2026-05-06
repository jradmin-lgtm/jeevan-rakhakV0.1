import { config } from "@jr/config";

/**
 * sendOtpSms — provider-agnostic OTP delivery.
 *
 * - mock provider: prints to API server console (great for dev + investor demos
 *   where you don't want to pay for SMS).
 * - twilio / msg91: wired but not exercised — drop creds into .env to enable.
 *
 * Returns the OTP delivery method so callers can log/audit.
 */
export async function sendOtpSms(phone: string, code: string, role: string): Promise<string> {
  const provider = config.sms.provider;
  switch (provider) {
    case "mock": {
      // eslint-disable-next-line no-console
      console.log(`\n┌──────────────────────────────────────────────`);
      console.log(`│  [SMS:mock] OTP for ${role}@${phone}: ${code}`);
      console.log(`│  (set SMS_PROVIDER=twilio or msg91 to send real SMS)`);
      console.log(`└──────────────────────────────────────────────\n`);
      return "mock-console";
    }
    case "twilio": {
      const { accountSid, authToken, from } = config.sms.twilio;
      if (!accountSid || !authToken || !from) {
        console.warn("[sms:twilio] credentials missing; falling back to console");
        console.log(`[SMS:twilio-fallback] ${phone}: ${code}`);
        return "twilio-fallback";
      }
      // Twilio REST API call — uncomment + add `node-fetch` if needed.
      // For now we keep this lazy so the team can drop in any HTTP client.
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const body = new URLSearchParams({
        To: phone,
        From: from,
        Body: `Your Jeevan Rakshak OTP is ${code}. Valid 5 min.`
      });
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body
        }
      );
      if (!res.ok) {
        const t = await res.text();
        console.warn(`[sms:twilio] failed (${res.status}): ${t}`);
        return "twilio-failed";
      }
      return "twilio";
    }
    case "msg91": {
      const { authKey, templateId, sender } = config.sms.msg91;
      if (!authKey || !templateId) {
        console.warn("[sms:msg91] credentials missing; falling back to console");
        console.log(`[SMS:msg91-fallback] ${phone}: ${code}`);
        return "msg91-fallback";
      }
      const res = await fetch("https://api.msg91.com/api/v5/otp", {
        method: "POST",
        headers: { authkey: authKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: phone.replace(/^\+/, ""),
          template_id: templateId,
          sender: sender || undefined,
          otp: code
        })
      });
      if (!res.ok) {
        const t = await res.text();
        console.warn(`[sms:msg91] failed (${res.status}): ${t}`);
        return "msg91-failed";
      }
      return "msg91";
    }
    default:
      throw new Error(`unknown SMS_PROVIDER: ${provider}`);
  }
}
