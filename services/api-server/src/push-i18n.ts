/**
 * CR3/CR4 (2026-08) — localized push-notification templates.
 *
 * Every push title/body Jeevan Rakshak sends lives here, keyed by a semantic
 * `PushTemplateKey` rather than hardcoded per call site. `pushToUser` /
 * `pushToDriver` (see push.ts) look up the recipient's `preferredLang`
 * (synced from the app's in-app language toggle via PATCH /api/v1/me) and
 * render from this file. Falls back to English for an unknown/unset lang.
 *
 * Scope note: this covers push-tray notifications only — the highest-value
 * "system message" a backgrounded/killed app surfaces. In-app socket toast
 * strings (shown while the screen is open, where surrounding UI is already
 * localized via each app's i18n.ts) are a separate, smaller surface not
 * covered by this pass.
 */

export type PushLang = "en" | "hi";

export type PushTemplateKey =
  | "sos_new"
  | "booking_new"
  | "booking_assigned"
  | "driver_arrived"
  | "en_route_hospital"
  | "trip_complete"
  | "booking_closed_patient_not_available"
  | "booking_closed_generic"
  | "booking_reassigning"
  | "safety_alert";

type Vars = Record<string, string | number>;
type Template = { title: string; body: (v: Vars) => string };

// Mirrors apps/driver-app's prettyEmergency() so the SOS push body doesn't
// mix a raw English enum value into an otherwise-localized Hindi sentence.
const EMERGENCY_LABELS: Record<PushLang, Record<string, string>> = {
  en: {
    ACCIDENT_TRAUMA: "Accident / Trauma",
    CARDIAC: "Cardiac",
    BREATHING_DISTRESS: "Breathing distress",
    PREGNANCY_NEONATAL: "Pregnancy / Neonatal",
    GENERAL_CRITICAL_TRANSFER: "Critical transfer"
  },
  hi: {
    ACCIDENT_TRAUMA: "दुर्घटना / चोट",
    CARDIAC: "हृदय संबंधी",
    BREATHING_DISTRESS: "सांस लेने में तकलीफ",
    PREGNANCY_NEONATAL: "गर्भावस्था / नवजात",
    GENERAL_CRITICAL_TRANSFER: "गंभीर स्थानांतरण"
  }
};

function emergencyLabel(lang: PushLang, raw: string): string {
  return EMERGENCY_LABELS[lang][raw] ?? raw;
}

const EN: Record<PushTemplateKey, Template> = {
  sos_new: {
    title: "🚨 New SOS request",
    body: (v) => `${emergencyLabel("en", String(v.emergencyType))} · ${Number(v.distanceKm).toFixed(1)} km away · tap to accept.`
  },
  booking_new: {
    title: "New ambulance request 🚑",
    body: () => "A patient nearby needs an ambulance · open the app to accept."
  },
  booking_assigned: {
    title: "Ambulance assigned 🚑",
    body: () => "A driver accepted your request and is on the way."
  },
  driver_arrived: {
    title: "Driver has arrived 📍",
    body: () => "Your ambulance is at the pickup point · share your ride OTP with the driver."
  },
  en_route_hospital: {
    title: "On the way to hospital 🏥",
    body: (v) => `En route to ${v.dropAddress ?? "the hospital"}.`
  },
  trip_complete: {
    title: "Trip complete 💚",
    body: () => "You've reached the hospital. Thank you for using Jeevan Rakshak."
  },
  booking_closed_patient_not_available: {
    title: "Booking closed",
    body: () => "The ambulance driver was unable to locate you at the pickup location. Please create a new request if assistance is still required."
  },
  booking_closed_generic: {
    title: "Booking closed",
    body: () => "Your booking was closed because we couldn't reach you. Please create a new request if assistance is still required."
  },
  booking_reassigning: {
    title: "Reassigning ambulance",
    body: () => "The assigned ambulance is unable to continue due to a vehicle issue. We are searching for another available ambulance."
  },
  safety_alert: {
    title: "🆘 Safety alert nearby",
    body: (v) => `Ride #${v.displayId ?? ""} needs help nearby. Tap to assist.`
  }
};

const HI: Record<PushTemplateKey, Template> = {
  sos_new: {
    title: "🚨 नई SOS रिक्वेस्ट",
    body: (v) => `${emergencyLabel("hi", String(v.emergencyType))} · ${Number(v.distanceKm).toFixed(1)} km दूर · स्वीकार करने के लिए टैप करें।`
  },
  booking_new: {
    title: "नई एम्बुलेंस रिक्वेस्ट 🚑",
    body: () => "पास में एक मरीज को एम्बुलेंस की ज़रूरत है · स्वीकार करने के लिए ऐप खोलें।"
  },
  booking_assigned: {
    title: "एम्बुलेंस असाइन हुई 🚑",
    body: () => "एक ड्राइवर ने आपकी रिक्वेस्ट स्वीकार कर ली है और रास्ते में है।"
  },
  driver_arrived: {
    title: "ड्राइवर पहुंच गया 📍",
    body: () => "आपकी एम्बुलेंस पिकअप पॉइंट पर है · ड्राइवर को अपना राइड OTP बताएं।"
  },
  en_route_hospital: {
    title: "अस्पताल की ओर जा रहे हैं 🏥",
    body: (v) => `${v.dropAddress ?? "अस्पताल"} की ओर जा रहे हैं।`
  },
  trip_complete: {
    title: "ट्रिप पूरी हुई 💚",
    body: () => "आप अस्पताल पहुंच गए हैं। जीवन रक्षक इस्तेमाल करने के लिए धन्यवाद।"
  },
  booking_closed_patient_not_available: {
    title: "बुकिंग बंद कर दी गई",
    body: () => "एम्बुलेंस ड्राइवर आपको पिकअप स्थान पर नहीं ढूंढ पाया। यदि अभी भी मदद चाहिए तो कृपया नई रिक्वेस्ट करें।"
  },
  booking_closed_generic: {
    title: "बुकिंग बंद कर दी गई",
    body: () => "आपसे संपर्क न हो पाने के कारण बुकिंग बंद कर दी गई। यदि अभी भी मदद चाहिए तो कृपया नई रिक्वेस्ट करें।"
  },
  booking_reassigning: {
    title: "दूसरी एम्बुलेंस ढूंढी जा रही है",
    body: () => "असाइन की गई एम्बुलेंस में गाड़ी की समस्या के कारण आगे नहीं बढ़ पा रही है। हम दूसरी उपलब्ध एम्बुलेंस ढूंढ रहे हैं।"
  },
  safety_alert: {
    title: "🆘 आस-पास सुरक्षा अलर्ट",
    body: (v) => `राइड #${v.displayId ?? ""} को आस-पास मदद की ज़रूरत है। सहायता के लिए टैप करें।`
  }
};

const TEMPLATES: Record<PushLang, Record<PushTemplateKey, Template>> = { en: EN, hi: HI };

export function renderPushTemplate(
  key: PushTemplateKey,
  lang: string | null | undefined,
  vars: Vars = {}
): { title: string; body: string } {
  const table = lang === "hi" ? TEMPLATES.hi : TEMPLATES.en;
  const t = table[key];
  return { title: t.title, body: t.body(vars) };
}
