import { useEffect, useReducer } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Driver-app i18n — same shape as user-app/src/i18n.ts. Per-app stores keep
 * the user/driver string namespaces independent and let either side ship
 * translations without touching the other binary. AsyncStorage key is
 * deliberately distinct (`jr.lang.driver` vs `jr.lang`) so a teammate using
 * both apps on the same device gets independent language settings — many
 * drivers prefer Hindi UI even when their patient app stays in English.
 */

export type Lang = "en" | "hi";

export const STORAGE_KEY = "jr.lang.driver";

type Dict = Record<string, string>;

const en: Dict = {
  // Login
  "login.title": "Driver sign in",
  "login.subtitle": "Enter your registered mobile",
  "login.mobile": "Mobile number",
  "login.send_otp": "Send OTP",
  "login.agree": "By continuing you agree to our",
  "login.privacy": "privacy policy",
  "login.patient_hint": "Booking an ambulance? Use the Jeevan Rakshak patient app.",
  "login.footer_care": "Created with care · Jeevan Rakshak",

  "otp.title": "Verify OTP",
  "otp.subtitle": "Sent to",
  "otp.resend": "Resend OTP",
  "otp.verify": "Verify & continue",

  // Google Sign-In (v1.0.13)
  "auth.google.title": "Driver welcome",
  "auth.google.subtitle": "Sign in with your Google account to continue",
  "auth.google.button": "Continue with Google",
  "auth.google.busy": "Signing in…",
  "auth.google.why_google": "We use Google sign-in for your security. Your number is verified once and stays linked to your Google account.",
  "auth.google.error_cancelled": "Sign-in cancelled.",
  "auth.google.error_play_services": "Google Play Services isn't available on this device. Update it from the Play Store and try again.",
  "auth.google.error_email_used": "This Google account is already registered as a driver.",
  "auth.google.error_phone_used": "This phone number is already linked to a different driver account.",
  "auth.google.error_generic": "Couldn't sign in. Please try again.",

  // Profile setup (first sign-in)
  "profile_setup.title": "Complete driver profile",
  "profile_setup.subtitle": "Two details before KYC verification",
  "profile_setup.name_label": "Full name",
  "profile_setup.name_placeholder": "Ravi Kumar",
  "profile_setup.phone_label": "Mobile number",
  "profile_setup.phone_placeholder": "+91 98xxx xxxxx",
  "profile_setup.phone_help": "This is how patients and ops will reach you on a live trip.",
  "profile_setup.continue": "Continue to KYC",
  "profile_setup.signed_in_as": "Signed in as",

  // Name capture
  "name.title": "What should we call you?",
  "name.subtitle": "So patients can identify their ambulance driver",
  "name.field": "Your name",
  "name.continue": "Continue",
  "name.footer": "Your name is shared only with the patients and our operations team.",

  // KYC onboarding
  "kyc.header.title": "Driver profile",
  "kyc.header.subtitle": "Submit your details for verification",
  "kyc.section.vehicle": "VEHICLE",
  "kyc.field.vehicle_number": "Ambulance vehicle number",
  "kyc.field.vehicle_type": "Vehicle type",
  "kyc.field.rc": "RC number (Vehicle registration certificate)",
  "kyc.field.insurance": "Insurance policy number",
  "kyc.section.driver": "DRIVER & LICENCE",
  "kyc.field.license": "Driving licence number",
  "kyc.note.photos": "Document photo upload arrives in v1.0.12. For now, our ops team will verify your details against physical copies during onboarding.",
  "kyc.section.hospital": "HOSPITAL / ORGANISATION",
  "kyc.field.hospital_name": "Hospital / organisation name",
  "kyc.field.hospital_id": "Your hospital employee ID",
  "kyc.submit": "Submit for verification",
  "kyc.submit.busy": "Submitting…",
  "kyc.footer": "Once verified, you'll receive ambulance requests automatically.\nVerification usually takes a few hours.",
  "kyc.success.title": "Profile submitted",
  "kyc.success.body": "Our team will verify your details. You'll start receiving requests once approved — usually within a few hours during pilot.",

  // KYC pending
  "kyc_pending.title": "Profile under review",
  "kyc_pending.subtitle": "You'll start receiving requests once approved",
  "kyc_pending.heading": "Verification in progress",
  "kyc_pending.body": "Our team is reviewing your documents and vehicle details. This usually takes a few hours during pilot.",
  "kyc_pending.auto_route": "We'll move you to the dashboard automatically the moment you're approved.",
  "kyc_pending.refresh": "Refresh status",

  // Dashboard
  "dashboard.hi": "Hi",
  "dashboard.welcome_sub": "Welcome to Jeevan Rakshak",
  "dashboard.online": "ONLINE",
  "dashboard.offline": "OFFLINE",
  "dashboard.receiving": "You are receiving requests",
  "dashboard.youoffline": "You are offline",
  "dashboard.go_online": "Go online",
  "dashboard.go_offline": "Go offline",
  "dashboard.trips_today": "TRIPS TODAY",
  "dashboard.rating": "RATING",
  "dashboard.incoming": "INCOMING REQUESTS",
  "dashboard.no_requests": "No incoming requests yet.",
  "dashboard.active_trip": "ACTIVE TRIP",
  "dashboard.open_trip": "Open trip"
};

const hi: Dict = {
  "login.title": "ड्राइवर साइन इन",
  "login.subtitle": "अपना पंजीकृत मोबाइल नंबर दर्ज करें",
  "login.mobile": "मोबाइल नंबर",
  "login.send_otp": "OTP भेजें",
  "login.agree": "जारी रखकर आप हमारी",
  "login.privacy": "गोपनीयता नीति",
  "login.patient_hint": "एम्बुलेंस बुक करनी है? Jeevan Rakshak पेशेंट ऐप का उपयोग करें।",
  "login.footer_care": "देखभाल के साथ बनाया · Jeevan Rakshak",

  "otp.title": "OTP सत्यापित करें",
  "otp.subtitle": "भेजा गया",
  "otp.resend": "OTP फिर से भेजें",
  "otp.verify": "सत्यापित करें",

  // Google Sign-In (extended — v1.0.13)
  "auth.google.title": "ड्राइवर स्वागत",
  "auth.google.subtitle": "जारी रखने के लिए अपने Google खाते से साइन इन करें",
  "auth.google.button": "Google से जारी रखें",
  "auth.google.busy": "साइन इन हो रहा है…",
  "auth.google.why_google": "आपकी सुरक्षा के लिए हम Google साइन-इन का उपयोग करते हैं। आपका नंबर एक बार सत्यापित होता है और आपके Google खाते से जुड़ा रहता है।",
  "auth.google.error_cancelled": "साइन इन रद्द किया गया।",
  "auth.google.error_play_services": "इस डिवाइस पर Google Play Services उपलब्ध नहीं है। Play Store से अपडेट करके फिर से कोशिश करें।",
  "auth.google.error_email_used": "यह Google खाता पहले से ड्राइवर के रूप में पंजीकृत है।",
  "auth.google.error_phone_used": "यह मोबाइल नंबर पहले से किसी अन्य ड्राइवर खाते से जुड़ा है।",
  "auth.google.error_generic": "साइन इन नहीं हो सका। कृपया फिर से कोशिश करें।",

  // Profile setup
  "profile_setup.title": "ड्राइवर प्रोफ़ाइल पूरी करें",
  "profile_setup.subtitle": "KYC सत्यापन से पहले बस दो जानकारियाँ",
  "profile_setup.name_label": "पूरा नाम",
  "profile_setup.name_placeholder": "रवि कुमार",
  "profile_setup.phone_label": "मोबाइल नंबर",
  "profile_setup.phone_placeholder": "+91 98xxx xxxxx",
  "profile_setup.phone_help": "इसी से मरीज़ और ऑपरेशन्स टीम लाइव यात्रा के दौरान आप तक पहुँचेंगे।",
  "profile_setup.continue": "KYC के लिए आगे बढ़ें",
  "profile_setup.signed_in_as": "इस रूप में साइन इन हैं",

  "name.title": "हम आपको क्या कहें?",
  "name.subtitle": "ताकि मरीज़ अपने ड्राइवर को पहचान सकें",
  "name.field": "आपका नाम",
  "name.continue": "जारी रखें",
  "name.footer": "आपका नाम केवल मरीज़ों और हमारी संचालन टीम के साथ साझा किया जाता है।",

  "kyc.header.title": "ड्राइवर प्रोफ़ाइल",
  "kyc.header.subtitle": "सत्यापन के लिए अपना विवरण दर्ज करें",
  "kyc.section.vehicle": "वाहन",
  "kyc.field.vehicle_number": "एम्बुलेंस वाहन संख्या",
  "kyc.field.vehicle_type": "वाहन का प्रकार",
  "kyc.field.rc": "RC नंबर (वाहन पंजीकरण प्रमाणपत्र)",
  "kyc.field.insurance": "बीमा पॉलिसी संख्या",
  "kyc.section.driver": "ड्राइवर और लाइसेंस",
  "kyc.field.license": "ड्राइविंग लाइसेंस संख्या",
  "kyc.note.photos": "दस्तावेज़ फोटो अपलोड v1.0.12 में आएगा। फिलहाल, हमारी टीम भौतिक प्रतियों के साथ आपके विवरण की जाँच करेगी।",
  "kyc.section.hospital": "अस्पताल / संगठन",
  "kyc.field.hospital_name": "अस्पताल / संगठन का नाम",
  "kyc.field.hospital_id": "आपकी अस्पताल कर्मचारी ID",
  "kyc.submit": "सत्यापन के लिए जमा करें",
  "kyc.submit.busy": "भेजा जा रहा है…",
  "kyc.footer": "एक बार सत्यापित होने पर आपको स्वतः एम्बुलेंस अनुरोध मिलने लगेंगे।\nसत्यापन में आमतौर पर कुछ घंटे लगते हैं।",
  "kyc.success.title": "प्रोफ़ाइल जमा हो गई",
  "kyc.success.body": "हमारी टीम आपके विवरण की समीक्षा करेगी। पायलट के दौरान आम तौर पर कुछ ही घंटों में अनुरोध मिलने लगेंगे।",

  "kyc_pending.title": "प्रोफ़ाइल समीक्षाधीन",
  "kyc_pending.subtitle": "अनुमोदन के बाद अनुरोध मिलने लगेंगे",
  "kyc_pending.heading": "सत्यापन प्रगति पर है",
  "kyc_pending.body": "हमारी टीम आपके दस्तावेज़ों और वाहन विवरण की जाँच कर रही है। यह आम तौर पर कुछ घंटे लेता है।",
  "kyc_pending.auto_route": "जैसे ही आप अनुमोदित होंगे, हम आपको स्वतः डैशबोर्ड पर ले जाएँगे।",
  "kyc_pending.refresh": "स्थिति रिफ्रेश करें",

  "dashboard.hi": "नमस्ते",
  "dashboard.welcome_sub": "Jeevan Rakshak में आपका स्वागत है",
  "dashboard.online": "ऑनलाइन",
  "dashboard.offline": "ऑफलाइन",
  "dashboard.receiving": "आप अनुरोध प्राप्त कर रहे हैं",
  "dashboard.youoffline": "आप ऑफलाइन हैं",
  "dashboard.go_online": "ऑनलाइन जाएँ",
  "dashboard.go_offline": "ऑफलाइन जाएँ",
  "dashboard.trips_today": "आज की यात्राएँ",
  "dashboard.rating": "रेटिंग",
  "dashboard.incoming": "आने वाले अनुरोध",
  "dashboard.no_requests": "अभी कोई अनुरोध नहीं।",
  "dashboard.active_trip": "सक्रिय यात्रा",
  "dashboard.open_trip": "यात्रा खोलें"
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
    /* default */
  }
}

export async function setLang(next: Lang): Promise<void> {
  currentLang = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* best-effort */
  }
  listeners.forEach((fn) => fn());
}

export function t(key: string): string {
  const dict = STRINGS[currentLang];
  return dict[key] ?? en[key] ?? key;
}

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
