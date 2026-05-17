import { useEffect, useReducer } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Minimal English/Hindi i18n for v1.0.11.1.
 *
 * - Strings the team explicitly translated in the feedback doc are authoritative.
 * - A few additional strings are translated to make whole screens read coherently
 *   in Hindi instead of code-switching mid-card. Marked with `// extended`.
 * - Untranslated strings fall back to English so partial coverage doesn't break
 *   the UI — adding more keys to `hi` later just upgrades those surfaces without
 *   a release.
 * - Persisted via AsyncStorage under `jr.lang`; hydrated in App.tsx at boot.
 *
 * Medical-vocabulary review (paramedic assessment, condition names) is still
 * deferred to a Hindi-speaking medical reviewer before we translate those flows.
 * Today they stay English on both languages — safer than translating
 * "Breathing distress" word-for-word and changing clinical meaning.
 */

export type Lang = "en" | "hi";

export const STORAGE_KEY = "jr.lang";

type Dict = Record<string, string>;

const en: Dict = {
  // Greetings + home
  "home.greet.morning": "Good morning",
  "home.greet.afternoon": "Good afternoon",
  "home.greet.evening": "Good evening",
  "home.subtitle": "What do you need today?",
  "home.profile": "Profile",
  "home.need_ambulance": "Need help right now?",
  "home.need_ambulance.sub": "Tap the red button for an emergency. The closest ambulance will be dispatched.",
  "home.book_card.title": "Book ambulance",
  "home.book_card.sub": "Non-emergency or scheduled · choose category",
  "home.sos": "SOS",
  "home.sos.tap": "Tap to dispatch",
  "home.active_trip": "ACTIVE TRIP",
  "home.active_ride": "ACTIVE RIDE",
  "home.active_ride.sub": "In progress · book again after completion",
  "home.active.pill": "ACTIVE",
  "home.open_tracking": "Open live tracking",
  "home.quick_actions": "QUICK ACTIONS",
  "home.trip_history": "Trip history",
  "home.medical_profile": "Medical profile",
  "home.sign_out": "Sign out",
  "home.made_with_care": "Made with care for India's emergency response.",

  // Login
  "login.title": "Sign in",
  "login.subtitle": "Enter your mobile number",
  "login.mobile": "Mobile number",
  "login.send_otp": "Send OTP",
  "login.agree": "By continuing you agree to our",
  "login.privacy": "privacy policy",
  "login.driver_hint": "Are you a driver? Sign in via the Jeevan Rakshak Driver app.",
  "login.footer_care": "Created with care · Jeevan Rakshak",

  // OTP
  "otp.title": "Verify OTP",
  "otp.subtitle": "We sent a 6-digit code to",
  "otp.resend": "Resend OTP",

  // Language picker
  "lang.title": "Choose your language",
  "lang.subtitle": "You can change this anytime from your profile",
  "lang.continue": "Continue",
  "lang.english": "English",
  "lang.hindi": "हिन्दी",

  // Generic
  "common.cancel": "Cancel",
  "common.continue": "Continue",
  "common.back": "Back"
};

const hi: Dict = {
  // From the team's feedback doc — authoritative
  "home.greet.evening": "शुभ संध्या",
  "home.subtitle": "आपको आज क्या चाहिए?",
  "home.need_ambulance": "क्या आपको अभी एम्बुलेंस चाहिए?",
  "home.book_card.title": "एम्बुलेंस बुक करें",
  "home.sos": "आपातकालीन SOS",
  "home.quick_actions": "त्वरित सेवाएँ",
  "home.trip_history": "यात्रा इतिहास",
  "home.medical_profile": "मेडिकल प्रोफ़ाइल",
  "home.sign_out": "लॉग आउट",

  // extended — standard greetings (low ambiguity)
  "home.greet.morning": "शुभ प्रभात",
  "home.greet.afternoon": "शुभ दोपहर",
  "home.profile": "प्रोफ़ाइल",
  "home.need_ambulance.sub": "आपातकाल के लिए लाल बटन दबाएँ। निकटतम एम्बुलेंस भेजी जाएगी।",
  "home.book_card.sub": "गैर-आपातकालीन या नियोजित · श्रेणी चुनें",
  "home.sos.tap": "भेजने के लिए टैप करें",
  "home.active_trip": "सक्रिय यात्रा",
  "home.active_ride": "सक्रिय राइड",
  "home.active_ride.sub": "प्रगति में · पूरा होने के बाद फिर बुक करें",
  "home.active.pill": "सक्रिय",
  "home.open_tracking": "लाइव ट्रैकिंग देखें",
  "home.made_with_care": "भारत की आपातकालीन सेवा के लिए बनाया गया।",

  // Login (extended, standard banking-app phrasing)
  "login.title": "साइन इन करें",
  "login.subtitle": "अपना मोबाइल नंबर दर्ज करें",
  "login.mobile": "मोबाइल नंबर",
  "login.send_otp": "OTP भेजें",
  "login.agree": "जारी रखकर आप हमारी",
  "login.privacy": "गोपनीयता नीति",
  "login.driver_hint": "क्या आप ड्राइवर हैं? Jeevan Rakshak Driver ऐप से साइन इन करें।",
  "login.footer_care": "देखभाल के साथ बनाया · Jeevan Rakshak",

  "otp.title": "OTP सत्यापित करें",
  "otp.subtitle": "हमने 6-अंकीय कोड भेजा है",
  "otp.resend": "OTP फिर से भेजें",

  "lang.title": "अपनी भाषा चुनें",
  "lang.subtitle": "आप इसे अपनी प्रोफ़ाइल से कभी भी बदल सकते हैं",
  "lang.continue": "जारी रखें",

  "common.cancel": "रद्द करें",
  "common.continue": "जारी रखें",
  "common.back": "वापस"
};

const STRINGS: Record<Lang, Dict> = { en, hi };

let currentLang: Lang = "en";
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return currentLang;
}

export async function hydrateLang(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "hi") {
      currentLang = stored;
    }
  } catch {
    /* fall back to default */
  }
}

export async function setLang(next: Lang): Promise<void> {
  currentLang = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* persistence best-effort */
  }
  listeners.forEach((fn) => fn());
}

export function t(key: string): string {
  const dict = STRINGS[currentLang];
  return dict[key] ?? en[key] ?? key;
}

/**
 * useT — hook for components. Returns t() bound to the current language and
 * a setLang to switch. Re-renders the calling component when language changes
 * anywhere in the app.
 */
export function useT() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return { t, lang: currentLang, setLang };
}
