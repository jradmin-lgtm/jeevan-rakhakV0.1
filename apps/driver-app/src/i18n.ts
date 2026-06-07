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
  "auth.google.switch_account": "Use another Google account",

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

  // Account deletion (Google Play compliance)
  "delete.button": "Delete account",
  "delete.title": "Delete your driver account?",
  "delete.body": "This will permanently remove your profile and KYC details. Completed trip records are kept for payout reconciliation but cannot be traced back to you. This cannot be undone.",
  "delete.confirm": "Delete forever",
  "delete.cancel": "Keep my account",
  "delete.in_trip_title": "Active trip in progress",
  "delete.in_trip_body": "Please complete or cancel your current trip before deleting your account.",
  "delete.error_generic": "Couldn't delete your account. Please try again or contact support.",

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
  "kyc.hospital.pick_help": "Select the hospital you operate for. You'll be tagged to it for dispatch.",
  "kyc.hospital.none": "No hospitals available yet. Please check back shortly or contact support.",
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
  "dashboard.open_trip": "Open trip",
  "dashboard.trip_history": "Trip history",
  "dashboard.profile": "Profile",
  "dashboard.sign_out": "Sign out",

  // v1.0.15: trip screen + map drop picker + trip history. Symmetric with
  // user-app's map_picker.* / drop_picker.* keys so the same MapLocationPicker
  // file renders Hindi when the driver toggles language.
  "trip.set_drop_required_title": "Set drop hospital",
  "trip.set_drop_required_body": "Search a hospital or pin it on the map. The patient app updates the moment you save.",
  "trip.set_drop_open_picker": "Choose drop on map",
  "trip.complete_locked_no_drop": "Set a drop hospital first to enable this button.",
  "trip.drive_to_hospital": "Drive to hospital",
  "trip.drop_completed": "Drop completed",

  // v1.2.0 (CR#2): driver-initiated cancellation sheet.
  "cancel.cancel_ride": "Cancel ride",
  "cancel.reason_title": "Why are you cancelling?",
  "cancel.reason.PATIENT_NOT_AVAILABLE": "Patient not at pickup",
  "cancel.reason.PATIENT_NOT_RESPONDING": "Patient not responding",
  "cancel.reason.VEHICLE_BREAKDOWN": "Vehicle breakdown / mechanical",
  "cancel.reason.TYRE_PUNCTURE": "Tyre puncture",
  "cancel.reason.CANNOT_REACH_PICKUP": "Can't reach pickup",
  "cancel.reason.OTHER": "Other",
  "cancel.other_remarks_placeholder": "Tell us briefly what happened (min 10 characters)",
  "cancel.remarks_min_hint": "{count}/10 characters minimum",
  "cancel.wait_countdown_hint": "Please wait and try reaching the patient. You can confirm cancellation once the timer ends.",
  "cancel.call_patient": "Call patient",
  "cancel.confirm_cancellation": "Confirm cancellation",
  "cancel.cancelled_redispatch_toast": "Ride released. We're finding another ambulance for the patient.",
  "cancel.cancelled_closed_toast": "Booking closed. You're free to accept new requests.",

  // v1.2.0 (CR#1): unified incoming-request queue.
  "incoming.title": "INCOMING REQUESTS",
  "incoming.sos_badge": "🚨 SOS EMERGENCY",
  "incoming.normal_badge": "🚑 BOOKING",
  "incoming.accept": "Accept",
  "incoming.reject": "Reject",
  "incoming.request_age_min": "{min}m ago",
  "incoming.just_now": "just now",
  "incoming.distance_km": "{km} km away",
  "incoming.reject_sos_title": "Reject this emergency?",
  "incoming.reject_sos_body": "This SOS will keep being offered to other ambulances. Reject only if you truly cannot respond.",
  "incoming.reject_confirm": "Reject",
  "incoming.keep": "Keep",

  // v1.2.0 (CR#3): hospital "acknowledge — preparing" surface on the trip.
  "trip.hospital_preparing_banner": "Hospital notified & preparing for arrival",

  "trip_history.title": "Trip history",
  "trip_history.subtitle": "Your completed trips",
  "trip_history.empty": "No completed trips yet.",
  "trip_history.km": "{km} km",
  "trip_history.duration": "{minutes} min",
  "trip_history.duration_long": "{hours}h {minutes}m",

  "drop_picker.title": "Pick drop location",
  "drop_picker.subtitle": "Drag the map · the red pin is your drop",
  "drop_picker.selected": "DROP LOCATION",
  "drop_picker.confirm": "Confirm this location",
  "drop_picker.detecting": "Finding address…",
  "drop_picker.loading_map": "Loading map…",
  "drop_picker.open_button": "Pin on the map",
  "drop_picker.refine_hint": "Drop a pin to set the exact location",

  "map_picker.title_pickup": "Set pickup location",
  "map_picker.title_drop": "Set drop location",
  "map_picker.subtitle_pickup": "Search a place or use GPS",
  "map_picker.subtitle_drop": "Search a hospital or pin on the map",
  "map_picker.search_placeholder_pickup": "Search address or landmark",
  "map_picker.search_placeholder_drop": "Search hospital or address",
  "map_picker.use_current": "Use my current location",
  "map_picker.gps_busy": "Getting GPS…",
  "map_picker.gps_denied": "Location permission denied",
  "map_picker.gps_error": "Couldn't read GPS — pin manually instead",
  "map_picker.searching": "Searching…",
  "map_picker.no_results": "No matches in India for this search",
  "map_picker.selected_pickup": "PICKUP",
  "map_picker.selected_drop": "DROP",
  "map_picker.confirm_pickup": "Confirm pickup",
  "map_picker.confirm_drop": "Confirm drop",
  "map_picker.pickup_open_button": "Edit pickup on map",
  "map_picker.pickup_hint": "Tap to set pickup precisely",

  // v1.2.4 (helpdesk): Help & Support — raise a ticket + two-way chat thread.
  "support.title": "Help & Support",
  "support.subtitle": "Raise a request or chat with our team",
  "support.dashboard_cta": "Help & Support",
  "support.raise_heading": "RAISE A REQUEST",
  "support.message_label": "What do you need help with?",
  "support.message_placeholder": "Describe your issue or feedback (min 5 characters)",
  "support.category_label": "Type",
  "support.category.ISSUE": "Issue",
  "support.category.FEEDBACK": "Feedback",
  "support.ride_label": "Link a trip (optional)",
  "support.ride_none": "No specific trip",
  "support.ride_picker_hint": "Pick a completed trip if this is about a specific ride.",
  "support.ride_loading": "Loading your trips…",
  "support.ride_empty": "No completed trips to link yet.",
  "support.submit": "Submit request",
  "support.submit_busy": "Submitting…",
  "support.submitted_toast": "Request submitted. Our team will reply here.",
  "support.error_too_short": "Please add a few more details (min 5 characters).",
  "support.error_generic": "Couldn't submit your request. Please try again.",
  "support.my_tickets": "MY REQUESTS",
  "support.empty": "No requests yet. Raise one above and we'll help.",
  "support.status.OPEN": "Open",
  "support.status.RESOLVED": "Resolved",
  "support.ride_tag": "Trip {id}",
  "support.thread_title": "Request",
  "support.thread_load_error": "Couldn't load this conversation — pull to retry.",
  "support.thread_empty": "No messages yet. Send a reply to start the conversation.",
  "support.reply_placeholder": "Type a reply…",
  "support.send": "Send",
  "support.send_busy": "Sending…",
  "support.reply_too_short": "Please type a longer reply.",
  "support.reply_error": "Couldn't send your reply. Please try again.",
  "support.resolved_notice": "This request has been resolved. Reply to reopen the conversation.",
  "support.author.you": "You",
  "support.author.team": "Support team",

  // Lang toggle (mirror of user-app)
  "lang.title": "Choose your language",
  "lang.subtitle": "You can change this from your profile",
  "lang.continue": "Continue",
  "lang.english": "English",
  "lang.hindi": "हिन्दी",

  "common.cancel": "Cancel",
  "common.continue": "Continue",
  "common.back": "Back"
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
  "auth.google.switch_account": "दूसरे Google खाते का उपयोग करें",

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

  // Account deletion — extended
  "delete.button": "खाता हटाएँ",
  "delete.title": "क्या आप अपना ड्राइवर खाता हटाना चाहते हैं?",
  "delete.body": "यह आपकी प्रोफ़ाइल और KYC विवरण को स्थायी रूप से हटा देगा। भुगतान समाधान के लिए पूर्ण यात्राओं के रिकॉर्ड रखे जाते हैं, लेकिन आप तक नहीं पहुँचा जा सकता। यह वापस नहीं किया जा सकता।",
  "delete.confirm": "स्थायी रूप से हटाएँ",
  "delete.cancel": "खाता रखें",
  "delete.in_trip_title": "सक्रिय यात्रा प्रगति पर है",
  "delete.in_trip_body": "कृपया अपनी मौजूदा यात्रा को पूरा या रद्द करें, फिर खाता हटाएँ।",
  "delete.error_generic": "खाता हटाया नहीं जा सका। कृपया फिर से कोशिश करें या सहायता से संपर्क करें।",

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
  "kyc.hospital.pick_help": "वह अस्पताल चुनें जिसके लिए आप काम करते हैं। डिस्पैच के लिए आपको इससे जोड़ा जाएगा।",
  "kyc.hospital.none": "अभी कोई अस्पताल उपलब्ध नहीं है। कृपया थोड़ी देर बाद देखें या सहायता से संपर्क करें।",
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
  "dashboard.open_trip": "यात्रा खोलें",
  "dashboard.trip_history": "यात्रा इतिहास",
  "dashboard.profile": "प्रोफ़ाइल",
  "dashboard.sign_out": "लॉग आउट",

  // v1.0.15: trip screen + drop picker + trip history (extended)
  "trip.set_drop_required_title": "ड्रॉप अस्पताल सेट करें",
  "trip.set_drop_required_body": "अस्पताल खोजें या नक्शे पर पिन करें। सेव करते ही मरीज़ का ऐप अपडेट हो जाएगा।",
  "trip.set_drop_open_picker": "नक्शे पर ड्रॉप चुनें",
  "trip.complete_locked_no_drop": "इस बटन को सक्षम करने के लिए पहले ड्रॉप अस्पताल सेट करें।",
  "trip.drive_to_hospital": "अस्पताल चलें",
  "trip.drop_completed": "ड्रॉप पूरा हुआ",

  // v1.2.0 (CR#2): ड्राइवर द्वारा रद्द करने की शीट
  "cancel.cancel_ride": "राइड रद्द करें",
  "cancel.reason_title": "आप रद्द क्यों कर रहे हैं?",
  "cancel.reason.PATIENT_NOT_AVAILABLE": "मरीज़ पिकअप पर मौजूद नहीं",
  "cancel.reason.PATIENT_NOT_RESPONDING": "मरीज़ जवाब नहीं दे रहा",
  "cancel.reason.VEHICLE_BREAKDOWN": "वाहन खराबी / मैकेनिकल",
  "cancel.reason.TYRE_PUNCTURE": "टायर पंक्चर",
  "cancel.reason.CANNOT_REACH_PICKUP": "पिकअप तक नहीं पहुँच सकते",
  "cancel.reason.OTHER": "अन्य",
  "cancel.other_remarks_placeholder": "संक्षेप में बताएँ क्या हुआ (कम से कम 10 अक्षर)",
  "cancel.remarks_min_hint": "{count}/10 अक्षर न्यूनतम",
  "cancel.wait_countdown_hint": "कृपया प्रतीक्षा करें और मरीज़ तक पहुँचने का प्रयास करें। टाइमर समाप्त होने पर आप रद्दीकरण की पुष्टि कर सकते हैं।",
  "cancel.call_patient": "मरीज़ को कॉल करें",
  "cancel.confirm_cancellation": "रद्दीकरण की पुष्टि करें",
  "cancel.cancelled_redispatch_toast": "राइड जारी की गई। हम मरीज़ के लिए दूसरी एम्बुलेंस खोज रहे हैं।",
  "cancel.cancelled_closed_toast": "बुकिंग बंद कर दी गई। आप नए अनुरोध स्वीकार करने के लिए स्वतंत्र हैं।",

  // v1.2.0 (CR#1): एकीकृत आने वाले अनुरोध सूची
  "incoming.title": "आने वाले अनुरोध",
  "incoming.sos_badge": "🚨 SOS आपातकाल",
  "incoming.normal_badge": "🚑 बुकिंग",
  "incoming.accept": "स्वीकार करें",
  "incoming.reject": "अस्वीकार करें",
  "incoming.request_age_min": "{min} मिनट पहले",
  "incoming.just_now": "अभी अभी",
  "incoming.distance_km": "{km} किमी दूर",
  "incoming.reject_sos_title": "इस आपातकाल को अस्वीकार करें?",
  "incoming.reject_sos_body": "यह SOS अन्य एम्बुलेंस को दिखता रहेगा। केवल तभी अस्वीकार करें जब आप वाकई जवाब नहीं दे सकते।",
  "incoming.reject_confirm": "अस्वीकार करें",
  "incoming.keep": "रखें",

  // v1.2.0 (CR#3): यात्रा पर अस्पताल "स्वीकृति — तैयारी" सूचना
  "trip.hospital_preparing_banner": "अस्पताल को सूचित किया गया और वह आगमन की तैयारी कर रहा है",

  "trip_history.title": "यात्रा इतिहास",
  "trip_history.subtitle": "आपकी पूरी हुई यात्राएँ",
  "trip_history.empty": "अभी तक कोई यात्रा पूरी नहीं हुई।",
  "trip_history.km": "{km} किमी",
  "trip_history.duration": "{minutes} मिनट",
  "trip_history.duration_long": "{hours} घं {minutes} मि",

  "drop_picker.title": "ड्रॉप स्थान चुनें",
  "drop_picker.subtitle": "नक्शा खींचें · लाल पिन आपका ड्रॉप है",
  "drop_picker.selected": "ड्रॉप स्थान",
  "drop_picker.confirm": "यह स्थान पुष्टि करें",
  "drop_picker.detecting": "पता खोजा जा रहा है…",
  "drop_picker.loading_map": "नक्शा लोड हो रहा है…",
  "drop_picker.open_button": "नक्शे पर पिन करें",
  "drop_picker.refine_hint": "सटीक स्थान के लिए नक्शे पर पिन करें",

  "map_picker.title_pickup": "पिकअप स्थान सेट करें",
  "map_picker.title_drop": "ड्रॉप स्थान सेट करें",
  "map_picker.subtitle_pickup": "स्थान खोजें या GPS का उपयोग करें",
  "map_picker.subtitle_drop": "अस्पताल खोजें या नक्शे पर पिन करें",
  "map_picker.search_placeholder_pickup": "पता या स्थलचिह्न खोजें",
  "map_picker.search_placeholder_drop": "अस्पताल या पता खोजें",
  "map_picker.use_current": "मेरी वर्तमान स्थिति उपयोग करें",
  "map_picker.gps_busy": "GPS लिया जा रहा है…",
  "map_picker.gps_denied": "स्थान अनुमति अस्वीकार",
  "map_picker.gps_error": "GPS नहीं मिला — कृपया मैनुअली पिन करें",
  "map_picker.searching": "खोजा जा रहा है…",
  "map_picker.no_results": "इस खोज के लिए भारत में कोई मिलान नहीं",
  "map_picker.selected_pickup": "पिकअप",
  "map_picker.selected_drop": "ड्रॉप",
  "map_picker.confirm_pickup": "पिकअप पुष्टि करें",
  "map_picker.confirm_drop": "ड्रॉप पुष्टि करें",
  "map_picker.pickup_open_button": "नक्शे पर पिकअप संपादित करें",
  "map_picker.pickup_hint": "पिकअप को सटीकता से सेट करने के लिए टैप करें",

  // v1.2.4 (helpdesk): सहायता एवं समर्थन — टिकट उठाएँ + दोतरफा चैट
  "support.title": "सहायता एवं समर्थन",
  "support.subtitle": "अनुरोध उठाएँ या हमारी टीम से चैट करें",
  "support.dashboard_cta": "सहायता एवं समर्थन",
  "support.raise_heading": "अनुरोध उठाएँ",
  "support.message_label": "आपको किसमें मदद चाहिए?",
  "support.message_placeholder": "अपनी समस्या या प्रतिक्रिया बताएँ (कम से कम 5 अक्षर)",
  "support.category_label": "प्रकार",
  "support.category.ISSUE": "समस्या",
  "support.category.FEEDBACK": "प्रतिक्रिया",
  "support.ride_label": "एक यात्रा जोड़ें (वैकल्पिक)",
  "support.ride_none": "कोई विशेष यात्रा नहीं",
  "support.ride_picker_hint": "यदि यह किसी विशेष यात्रा के बारे में है तो एक पूर्ण यात्रा चुनें।",
  "support.ride_loading": "आपकी यात्राएँ लोड हो रही हैं…",
  "support.ride_empty": "जोड़ने के लिए अभी कोई पूर्ण यात्रा नहीं।",
  "support.submit": "अनुरोध भेजें",
  "support.submit_busy": "भेजा जा रहा है…",
  "support.submitted_toast": "अनुरोध भेज दिया गया। हमारी टीम यहीं उत्तर देगी।",
  "support.error_too_short": "कृपया कुछ और विवरण जोड़ें (कम से कम 5 अक्षर)।",
  "support.error_generic": "आपका अनुरोध नहीं भेजा जा सका। कृपया फिर से कोशिश करें।",
  "support.my_tickets": "मेरे अनुरोध",
  "support.empty": "अभी तक कोई अनुरोध नहीं। ऊपर एक उठाएँ और हम मदद करेंगे।",
  "support.status.OPEN": "खुला",
  "support.status.RESOLVED": "हल हो गया",
  "support.ride_tag": "यात्रा {id}",
  "support.thread_title": "अनुरोध",
  "support.thread_load_error": "यह बातचीत लोड नहीं हो सकी — फिर से कोशिश के लिए खींचें।",
  "support.thread_empty": "अभी तक कोई संदेश नहीं। बातचीत शुरू करने के लिए उत्तर भेजें।",
  "support.reply_placeholder": "उत्तर लिखें…",
  "support.send": "भेजें",
  "support.send_busy": "भेजा जा रहा है…",
  "support.reply_too_short": "कृपया थोड़ा लंबा उत्तर लिखें।",
  "support.reply_error": "आपका उत्तर नहीं भेजा जा सका। कृपया फिर से कोशिश करें।",
  "support.resolved_notice": "यह अनुरोध हल हो गया है। बातचीत फिर से खोलने के लिए उत्तर दें।",
  "support.author.you": "आप",
  "support.author.team": "समर्थन टीम",

  "lang.title": "अपनी भाषा चुनें",
  "lang.subtitle": "आप इसे अपनी प्रोफ़ाइल से बदल सकते हैं",
  "lang.continue": "जारी रखें",
  "lang.english": "English",
  "lang.hindi": "हिन्दी",

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
