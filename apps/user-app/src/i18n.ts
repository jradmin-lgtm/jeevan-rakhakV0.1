import { useEffect, useReducer } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { me } from "./api";

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
  "home.get_help": "Get help / Raise a request",
  "home.get_help.sub": "Chat with our team about a ride or anything else",
  "home.made_with_care": "Made with care for India's emergency response.",

  // Help & Support — v1.2.4 helpdesk (raise + two-way chat)
  "support.title": "Help & Support",
  "support.subtitle": "Raise a request or chat with our team",
  "support.raise_heading": "RAISE A REQUEST",
  "support.message_label": "What do you need help with?",
  "support.message_placeholder": "Describe your issue or feedback (min 5 characters)",
  "support.category_label": "Type",
  "support.category.ISSUE": "Issue",
  "support.category.FEEDBACK": "Feedback",
  "support.ride_label": "Link a ride (optional)",
  "support.ride_none": "No specific ride",
  "support.ride_picker_hint": "Pick a completed ride if this is about a specific trip.",
  "support.ride_empty": "No completed rides to link yet.",
  "support.submit": "Submit request",
  "support.submit_busy": "Submitting…",
  "support.submitted_toast": "Request submitted. Our team will reply here.",
  "support.error_too_short": "Please add a few more details (min 5 characters).",
  "support.error_generic": "Couldn't submit your request. Please try again.",
  "support.my_tickets": "MY REQUESTS",
  "support.empty": "No requests yet. Raise one above and we'll help.",
  "support.status.OPEN": "Open",
  "support.status.RESOLVED": "Resolved",
  "support.ride_tag": "Ride {id}",
  "support.thread_title": "Request",
  "support.reply_placeholder": "Type a reply…",
  "support.send": "Send",
  "support.send_busy": "Sending…",
  "support.reply_too_short": "Please type a longer reply.",
  "support.reply_error": "Couldn't send your reply. Please try again.",
  "support.thread_load_error": "Couldn't load this conversation · pull to retry.",
  "support.thread_empty": "No messages yet. Send a reply to start the conversation.",
  "support.resolved_notice": "This request has been resolved. Reply to reopen the conversation.",
  "support.author.you": "You",
  "support.author.team": "Support team",

  // Login (legacy OTP path — kept for fallback only)
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

  // Google Sign-In (v1.0.13)
  "auth.google.title": "Welcome",
  "auth.google.subtitle": "Sign in with your Google account to continue",
  "auth.google.button": "Continue with Google",
  "auth.google.busy": "Signing in…",
  "auth.google.why_google": "We use Google sign-in for your security. Your number is verified once and stays linked to your Google account.",
  "auth.google.error_cancelled": "Sign-in cancelled.",
  "auth.google.error_play_services": "Google Play Services isn't available on this device. Update it from the Play Store and try again.",
  "auth.google.error_email_used": "This Google account is already registered. If you don't recognise the account, contact support.",
  "auth.google.error_phone_used": "This phone number is already linked to a different Google account. Contact support if you've lost access.",
  "auth.google.error_generic": "Couldn't sign in. Please try again.",
  "auth.google.switch_account": "Use another Google account",

  // Profile setup (first sign-in)
  "profile_setup.title": "Complete your profile",
  "profile_setup.subtitle": "Just two more details so the driver can reach you",
  "profile_setup.name_label": "Full name",
  "profile_setup.name_placeholder": "Ravi Kumar",
  "profile_setup.phone_label": "Mobile number",
  "profile_setup.phone_placeholder": "+91 98xxx xxxxx",
  "profile_setup.phone_help": "We share this with the assigned driver and our operations team only.",
  "profile_setup.continue": "Continue",
  "profile_setup.signed_in_as": "Signed in as",

  // Drop location picker (v1.0.13)
  "drop_picker.title": "Pick drop location",
  "drop_picker.subtitle": "Drag the map · the red pin is your drop",
  "drop_picker.selected": "DROP LOCATION",
  "drop_picker.confirm": "Confirm this location",
  "drop_picker.detecting": "Detecting address…",
  "drop_picker.loading_map": "Loading map…",
  "drop_picker.open_button": "Pin on map",
  "drop_picker.refine_hint": "Drop pin on map for exact location",

  // Map picker — v1.0.13 (revised) with search + dual-mode (pickup / drop)
  "map_picker.title_pickup": "Set pickup location",
  "map_picker.title_drop": "Set drop location",
  "map_picker.subtitle_pickup": "Search a place or use your GPS",
  "map_picker.subtitle_drop": "Search a hospital or pin on the map",
  "map_picker.search_placeholder_pickup": "Search address or landmark",
  "map_picker.search_placeholder_drop": "Search hospital or address",
  "map_picker.use_current": "Use my current location",
  "map_picker.gps_busy": "Getting GPS…",
  "map_picker.gps_denied": "Location permission denied",
  "map_picker.gps_error": "Couldn't read GPS · pin manually instead",
  "map_picker.searching": "Searching…",
  "map_picker.no_results": "No matches in India for this search",
  "map_picker.selected_pickup": "PICKUP",
  "map_picker.selected_drop": "DROP",
  "map_picker.confirm_pickup": "Confirm pickup",
  "map_picker.confirm_drop": "Confirm drop",
  "map_picker.pickup_open_button": "Edit pickup on map",
  "map_picker.pickup_hint": "Tap to set pickup precisely",

  // Account deletion (Google Play compliance)
  "delete.button": "Delete account",
  "delete.title": "Delete your account?",
  "delete.body": "This will permanently remove your profile, medical details, and emergency contact. Past trip records are kept for hospital billing reference, but cannot be traced back to you. This cannot be undone.",
  "delete.confirm": "Delete forever",
  "delete.cancel": "Keep my account",
  "delete.in_progress_title": "Trip in progress",
  "delete.in_progress_body": "You're currently in an ambulance. Please wait until the trip is completed before deleting your account.",
  "delete.error_generic": "Couldn't delete your account. Please try again or contact support.",

  // Language picker
  "lang.title": "Choose your language",
  "lang.subtitle": "You can change this anytime from your profile",
  "lang.continue": "Continue",
  "lang.english": "English",
  "lang.hindi": "हिन्दी",

  // Emergency type selector (v1.0.15) — labels read in render so they re-translate
  // when the user toggles language mid-screen.
  "emergency.cardiac.label": "Cardiac",
  "emergency.cardiac.sub": "Chest pain, heart attack",
  "emergency.breathing.label": "Breathing distress",
  "emergency.breathing.sub": "Asthma, oxygen support",
  "emergency.accident.label": "Accident / Trauma",
  "emergency.accident.sub": "Road accident, injury",
  "emergency.pregnancy.label": "Pregnancy",
  "emergency.pregnancy.sub": "Labour, neonatal",
  "emergency.critical_transfer.label": "Critical transfer",
  "emergency.critical_transfer.sub": "Hospital to hospital",
  // CR3 (2026-08): separate from emergency.pregnancy.label above — that key's
  // paired .sub ("Labour, neonatal") already covers neonatal in the type-
  // selector chip context; this one is for the compact pill (prettyEmergency,
  // no room for a subtitle) which previously showed "Pregnancy / Neonatal"
  // hardcoded.
  "emergency.pregnancy_neonatal.pill_label": "Pregnancy / Neonatal",
  "emergency.disclaimer.title": "About emergency help",
  "emergency.disclaimer.body": "In a life-threatening emergency you can also call 108. Jeevan Rakshak helps dispatch an ambulance, but it does not replace official emergency services.",

  // Live tracking — extended for SOS cascade-wait UI + post-completion routing (v1.0.15)
  "live.searching_title": "Searching for nearest ambulance",
  "live.searching_sub": "We're notifying drivers nearby and expanding the search every minute.",
  "live.cascade_exhausted_title": "No driver available right now",
  "live.cascade_exhausted_sub": "Please call our mobile {phone} for immediate help.",
  "live.driver_assigned": "Driver assigned · on the way",
  "live.you_pay": "YOU PAY",
  "live.cashless_hint": "Cashless · billed in-app on completion",

  // Post-completion payment (v1.0.15)
  "payment.title": "Trip complete",
  "payment.complete_label": "✓  TRIP COMPLETE",
  "payment.review_charges": "Review and pay",
  "payment.hint": "Apply your coupon and tap Mark paid to finish the ride.",
  "payment.processing": "Processing…",
  "payment.finish_free": "Mark paid · finish (₹0)",
  "payment.finish_amount": "Mark paid · finish · ₹{amount}",
  "payment.wait_for_driver_to_complete": "The driver hasn't marked the trip complete yet. Try again in a moment.",
  "payment.paid_label": "Paid",
  "payment.paid_zero": "Paid: ₹0",

  // History (v1.0.15) — fare label switched to "paid"
  "history.paid": "Paid",
  "history.paid_zero": "Paid: ₹0",

  // Generic
  "common.cancel": "Cancel",
  "common.continue": "Continue",
  "common.back": "Back",

  // CR3 (2026-08): translation-coverage sweep — new keys for screens/helpers
  // that previously bypassed t() with hardcoded English.
  "common.switch_language": "Switch language",
  "common.please_try_again": "Please try again.",
  "common.try_again_short": "Try again.",
  "common.saved_title": "Saved",
  "common.save": "Save",
  "common.done": "Done",

  "payment.booking_number": "Booking #{id}",

  "home.banner_serving": "Serving {city} within {radius} km of {hospital}",
  "home.pickup_prefix": "Pickup: {address}",
  "home.sos_a11y": "Emergency SOS · dispatch ambulance now",
  "home.sos_short": "SOS",

  "splash.tagline": "Emergency ambulance, on demand.",

  "name_capture.error_too_short": "Please enter your full name so the driver can identify you.",
  "name_capture.error_generic": "Could not save your name. Please try again.",
  "name_capture.title": "What should we call you?",
  "name_capture.subtitle": "So the driver can address you on arrival",
  "name_capture.name_label": "Your name",
  "name_capture.privacy_note": "Your name is shared only with the assigned driver and our operations team.",

  "medical.saved_body": "Your medical profile has been updated.",
  "medical.save_error_title": "Could not save",
  "medical.subtitle": "Shared with the ambulance crew during dispatch",
  "medical.account_label": "ACCOUNT",
  "medical.edit_details_label": "EDIT MEDICAL DETAILS",
  "medical.name_placeholder": "As on hospital records",
  "medical.blood_group_label": "Blood group",
  "medical.blood_group_placeholder": "e.g. O+",
  "medical.allergies_label": "Allergies / chronic conditions",
  "medical.allergies_placeholder": "Penicillin, asthma, etc.",
  "medical.emergency_contact_label": "Emergency contact",
  "medical.emergency_contact_placeholder": "Family or guardian phone",
  "medical.privacy_note": "This information is only shared with the responding ambulance team.",

  "history.trips_count": "{count} trips so far",
  "history.empty_title": "No bookings yet",
  "history.empty_description": "Your trips will appear here. Pull down to refresh.",
  "history.paid_amount": "Paid: ₹{amount}",
  "history.pickup_location_fallback": "Pickup location",

  "sos.confirm_title": "Send SOS now?",
  "sos.confirm_message": "We'll dispatch the closest ambulance with cardiac priority.",
  "sos.confirm_button": "Send SOS",
  "sos.location_unavailable_title": "Location unavailable",
  "sos.location_unavailable_body": "We can't send an ambulance without your location. Allow location access and try again, or call our mobile {phone} to book by phone.",
  "sos.allow_location": "Allow location",
  "sos.call_number": "Call {phone}",
  "sos.failed_title": "SOS failed",
  "sos.headline": "Emergency SOS",
  "sos.headline_sub": "Hold the button below to dispatch the nearest ambulance immediately.",
  "sos.button_label": "SOS",
  "sos.info_card_title": "For life-threatening emergencies",
  "sos.info_card_body": "This sends a high-priority cardiac dispatch. Misuse may suspend your account.",
  "sos.cancel_and_back": "Cancel and go back",
  "sos.sending": "Sending SOS…",

  "map_picker.unnamed_place": "Unnamed place",

  "book.detecting_location": "Detecting your live location…",
  "book.location_permission_needed": "Allow location access to book · we need it to send the ambulance to you.",
  "book.location_active": "Live location active · {lat}, {lng} (±{accuracy}m)",
  "book.location_last_known": "Using your last known location (GPS lock failed) · tap Refresh to retry.",
  "book.location_failed": "Couldn't detect location · tap Refresh, or call support to book by phone.",
  "book.coupon_invalid": "That coupon isn't valid for this account.",
  "book.out_of_area_error": "Jeevan Rakshak is live in {city} only right now. We cannot dispatch to your location yet.",
  "book.create_error": "Could not create booking. Please try again.",
  "book.emergency_type_label": "EMERGENCY TYPE",
  "book.pickup_location_label": "PICKUP LOCATION",
  "book.detecting_short": "Detecting…",
  "book.location_not_set": "Location not set",
  "book.location_share_note": "Your live location is what we share with the ambulance team.",
  "book.gps_button": "GPS",
  "book.drop_label": "Drop / hospital (optional)",
  "book.drop_placeholder": "Hospital or address",
  "book.edit_pin_on_map": "📍 Edit pin on map",
  "book.exact_location_set": "Exact location set · {lat}, {lng}",
  "book.fare_offers_label": "FARE & OFFERS",
  "book.calculating": "Calculating…",
  "book.fare_distance": "Distance ({km} km × ₹{rate})",
  "book.fare_vehicle": "Vehicle ({type} × {mult})",
  "book.fare_priority": "Priority dispatch",
  "book.fare_night_surcharge": "Night surcharge (10pm to 6am)",
  "book.fare_subtotal": "Subtotal",
  "book.fare_eta_label": "⏱  Ambulance arrives in",
  "book.fare_minimum_estimate": "Minimum fare estimate",
  "book.fare_no_drop_hint": "Pin a drop location to see the distance-based fare. Industry rates: ₹{rate}/km · minimum ₹{fare}.",
  "book.coupon_applied_label": "Coupon {code}",
  "book.total_payable": "Total payable",
  "book.remove_coupon": "Remove coupon",
  "book.coupon_code_label": "Coupon code",
  "book.apply": "Apply",
  "book.launch_offer_hint": "Use launch offer: {code} (100% off)",
  "book.dispatching": "Dispatching…",
  "book.confirm_free": "Confirm and dispatch (free)",
  "book.confirm_amount": "Confirm and dispatch · ₹{amount}",
  "book.footer_note": "We dispatch the nearest available ambulance · Cashless during launch offer",

  "live.toast_driver_arrived": "Driver has arrived",
  "live.toast_pickup_confirmed": "Pickup confirmed",
  "live.toast_trip_completed": "Trip completed",
  "live.toast_cascade_exhausted": "No driver yet · please call the support mobile.",
  "live.toast_booking_closed": "Your booking was closed.",
  "live.toast_reassigning": "Reassigning to another ambulance…",
  "live.toast_safety_closed": "Safety alert closed. Help has been notified.",
  "live.cancel_dialog_title": "Cancel this booking?",
  "live.cancel_dialog_no_driver": "No driver has been assigned yet · you can cancel freely.",
  "live.cancel_dialog_driver_assigned": "A driver is on the way. They'll be notified that the trip was cancelled.",
  "live.cancel_booking": "Cancel booking",
  "live.keep_booking": "Keep booking",
  "live.already_in_progress_title": "Trip already in progress",
  "live.already_in_progress_body": "You're already in the ambulance. Cancellation isn't possible once the trip has started · please coordinate with the driver if anything has changed.",
  "live.cancel_error_title": "Could not cancel",
  "live.toast_safety_sent": "Safety alert sent. Help is being notified.",
  "live.toast_safety_stood_down": "Safety alert stood down.",
  "live.looking_for_driver": "Looking for driver",
  "live.timer_driver_arrives_in": "Driver arrives in",
  "live.timer_driver_waiting": "Driver waiting",
  "live.timer_at_pickup": "at pickup",
  "live.timer_hospital_eta": "Hospital ETA",
  "live.timer_enroute": "En route to hospital",
  "live.screen_title": "Live tracking",
  "live.pickup_label": "PICKUP",
  "live.destination_hospital_label": "DESTINATION HOSPITAL",
  "live.drop_label": "DROP",
  "live.free_label": "FREE",
  "live.coupon_applied_saved": "Coupon {code} applied · saved ₹{amount}",
  "live.otp_tell_driver_label": "TELL THIS OTP TO THE DRIVER",
  "live.otp_label": "RIDE OTP",
  "live.otp_explainer": "The driver will ask you for this 4-digit code before starting the trip.",
  "live.driver_live_label": "DRIVER LIVE",
  "live.live_seconds_ago": "LIVE · {seconds}s",
  "live.pin_pickup": "Pickup",
  "live.pin_driver": "Driver",
  "live.pin_hospital_fallback": "Hospital",
  "live.distance_label": "DISTANCE",
  "live.eta_label": "ETA",
  "live.map_waiting_hint": "Live driver position appears on this map once the trip starts.",
  "live.open_google_maps": "Open in Google Maps",
  "live.driver_fallback_name": "Driver",
  "live.vehicle_pending": "Vehicle pending",
  "live.call_driver_a11y": "Call {name}",
  "live.rating_title": "How was your driver?",
  "live.rating_subtitle": "Your rating helps the next patient get the best ambulance team.",
  "live.rating_feedback_label": "Anything our team should know? (optional)",
  "live.rating_feedback_placeholder": "What went well, what could improve",
  "live.rating_submit": "Submit rating",
  "live.rating_error_title": "Could not submit",
  "live.need_help_label": "NEED HELP?",
  "live.need_help_body": "Contact our support team any time · we'll reach the driver and coordinate.",
  "live.trip_in_progress_note": "Trip is in progress · coordinate with the driver by call if you need to change anything.",
  "live.patient_condition_required": "Please select the emergency condition.",
  "live.patient_save_error": "Could not save. Please try again.",
  "live.patient_details_label": "PATIENT DETAILS",
  "live.patient_details_note": "Helps our team prepare medical response. Only condition and notes go to the hospital · driver sees name only.",
  "live.patient_name_label": "Patient name",
  "live.patient_name_placeholder": "Optional · helps the driver",
  "live.patient_age_label": "Age",
  "live.optional_placeholder": "Optional",
  "live.patient_gender_label": "Gender",
  "live.gender_male": "Male",
  "live.gender_female": "Female",
  "live.gender_other": "Other",
  "live.patient_notes_label": "Notes for medical team (optional)",
  "live.sending": "Sending…",
  "live.send_to_medical_team": "Send to medical team",
  "live.status_headline.requested": "Finding the nearest ambulance…",
  "live.status_headline.accepted": "Driver is on the way to you",
  "live.status_headline.picked_up": "On the way to hospital",
  "live.status_headline.cancelled": "Booking cancelled",
  "live.status_subline.requested": "We are notifying available ambulances. This usually takes under 60 seconds.",
  "live.status_subline.accepted": "Track the live position of your ambulance below.",
  "live.status_subline.arrived": "Please reach the pickup spot. Your safety is our priority.",
  "live.status_subline.picked_up": "We're heading to the destination hospital.",
  "live.status_subline.completed": "Thank you. Please rate your experience.",
  "live.status_subline.cancelled": "You can book another ambulance from the home screen.",
  "live.status_subline.timed_out": "Try booking again in a moment, or use the SOS button for fastest dispatch.",

  // Patient emergency-condition chips + the free-text notes placeholder —
  // English only pending clinical review before Hindi translation (see file
  // header note). Centralized here so they're swappable in one place once
  // that review happens.
  "live.condition.road_accident": "Road Accident",
  "live.condition.trauma_firearm": "Trauma · Firearm",
  "live.condition.trauma_sharp": "Trauma · Sharp Object",
  "live.condition.pregnancy": "Pregnancy",
  "live.condition.diabetic_unconscious": "Diabetic Unconscious",
  "live.condition.snake_bite": "Snake Bite",
  "live.condition.poison": "Poison Consumption",
  "live.condition.chest_pain": "Chest Pain / Heart Attack",
  "live.condition.breathing_difficulty": "Breathing Difficulty",
  "live.condition.unconscious": "Unconscious Patient",
  "live.condition.severe_bleeding": "Severe Bleeding",
  "live.condition.burn_fire": "Burn / Fire",
  "live.condition.stroke": "Stroke Symptoms",
  "live.condition.high_fever_seizure": "High Fever / Seizure",
  "live.condition.other": "Other",
  "live.patient_notes_placeholder": "e.g., diabetic, on blood thinners"
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
  "home.get_help": "मदद पाएँ / अनुरोध उठाएँ",
  "home.get_help.sub": "किसी राइड या किसी और बात के लिए हमारी टीम से चैट करें",

  // Help & Support — v1.2.4 helpdesk (raise + two-way chat)
  "support.title": "सहायता एवं समर्थन",
  "support.subtitle": "अनुरोध उठाएँ या हमारी टीम से चैट करें",
  "support.raise_heading": "अनुरोध उठाएँ",
  "support.message_label": "आपको किसमें मदद चाहिए?",
  "support.message_placeholder": "अपनी समस्या या प्रतिक्रिया बताएँ (कम से कम 5 अक्षर)",
  "support.category_label": "प्रकार",
  "support.category.ISSUE": "समस्या",
  "support.category.FEEDBACK": "प्रतिक्रिया",
  "support.ride_label": "एक राइड जोड़ें (वैकल्पिक)",
  "support.ride_none": "कोई विशेष राइड नहीं",
  "support.ride_picker_hint": "यदि यह किसी विशेष यात्रा के बारे में है तो एक पूर्ण राइड चुनें।",
  "support.ride_empty": "जोड़ने के लिए अभी कोई पूर्ण राइड नहीं।",
  "support.submit": "अनुरोध भेजें",
  "support.submit_busy": "भेजा जा रहा है…",
  "support.submitted_toast": "अनुरोध भेज दिया गया। हमारी टीम यहीं उत्तर देगी।",
  "support.error_too_short": "कृपया कुछ और विवरण जोड़ें (कम से कम 5 अक्षर)।",
  "support.error_generic": "आपका अनुरोध नहीं भेजा जा सका। कृपया फिर से कोशिश करें।",
  "support.my_tickets": "मेरे अनुरोध",
  "support.empty": "अभी तक कोई अनुरोध नहीं। ऊपर एक उठाएँ और हम मदद करेंगे।",
  "support.status.OPEN": "खुला",
  "support.status.RESOLVED": "हल हो गया",
  "support.ride_tag": "राइड {id}",
  "support.thread_title": "अनुरोध",
  "support.reply_placeholder": "उत्तर लिखें…",
  "support.send": "भेजें",
  "support.send_busy": "भेजा जा रहा है…",
  "support.reply_too_short": "कृपया थोड़ा लंबा उत्तर लिखें।",
  "support.reply_error": "आपका उत्तर नहीं भेजा जा सका। कृपया फिर से कोशिश करें।",
  "support.thread_load_error": "यह बातचीत लोड नहीं हो सकी · फिर से कोशिश के लिए खींचें।",
  "support.thread_empty": "अभी तक कोई संदेश नहीं। बातचीत शुरू करने के लिए उत्तर भेजें।",
  "support.resolved_notice": "यह अनुरोध हल हो गया है। बातचीत फिर से खोलने के लिए उत्तर दें।",
  "support.author.you": "आप",
  "support.author.team": "समर्थन टीम",

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

  // Google Sign-In (extended — v1.0.13)
  "auth.google.title": "स्वागत है",
  "auth.google.subtitle": "जारी रखने के लिए अपने Google खाते से साइन इन करें",
  "auth.google.button": "Google से जारी रखें",
  "auth.google.busy": "साइन इन हो रहा है…",
  "auth.google.why_google": "आपकी सुरक्षा के लिए हम Google साइन-इन का उपयोग करते हैं। आपका नंबर एक बार सत्यापित होता है और आपके Google खाते से जुड़ा रहता है।",
  "auth.google.error_cancelled": "साइन इन रद्द किया गया।",
  "auth.google.error_play_services": "इस डिवाइस पर Google Play Services उपलब्ध नहीं है। Play Store से अपडेट करके फिर से कोशिश करें।",
  "auth.google.error_email_used": "यह Google खाता पहले से पंजीकृत है। यदि आप इसे नहीं पहचानते, तो सहायता से संपर्क करें।",
  "auth.google.error_phone_used": "यह मोबाइल नंबर पहले से किसी अन्य Google खाते से जुड़ा है। यदि आपका एक्सेस खो गया है, तो सहायता से संपर्क करें।",
  "auth.google.error_generic": "साइन इन नहीं हो सका। कृपया फिर से कोशिश करें।",
  "auth.google.switch_account": "दूसरे Google खाते का उपयोग करें",

  // Profile setup (first sign-in) — extended
  "profile_setup.title": "अपनी प्रोफ़ाइल पूरी करें",
  "profile_setup.subtitle": "ड्राइवर आप तक पहुँच सके इसके लिए बस दो जानकारियाँ चाहिए",
  "profile_setup.name_label": "पूरा नाम",
  "profile_setup.name_placeholder": "रवि कुमार",
  "profile_setup.phone_label": "मोबाइल नंबर",
  "profile_setup.phone_placeholder": "+91 98xxx xxxxx",
  "profile_setup.phone_help": "हम यह केवल असाइन किए गए ड्राइवर और हमारी ऑपरेशन्स टीम के साथ साझा करते हैं।",
  "profile_setup.continue": "जारी रखें",
  "profile_setup.signed_in_as": "इस रूप में साइन इन हैं",

  // Drop location picker — extended (v1.0.13)
  "drop_picker.title": "ड्रॉप स्थान चुनें",
  "drop_picker.subtitle": "नक्शा खींचें · लाल पिन आपका ड्रॉप है",
  "drop_picker.selected": "ड्रॉप स्थान",
  "drop_picker.confirm": "यह स्थान पुष्टि करें",
  "drop_picker.detecting": "पता खोजा जा रहा है…",
  "drop_picker.loading_map": "नक्शा लोड हो रहा है…",
  "drop_picker.open_button": "नक्शे पर पिन करें",
  "drop_picker.refine_hint": "सटीक स्थान के लिए नक्शे पर पिन करें",

  // Map picker — extended (v1.0.13 revised)
  "map_picker.title_pickup": "पिकअप स्थान सेट करें",
  "map_picker.title_drop": "ड्रॉप स्थान सेट करें",
  "map_picker.subtitle_pickup": "स्थान खोजें या GPS का उपयोग करें",
  "map_picker.subtitle_drop": "अस्पताल खोजें या नक्शे पर पिन करें",
  "map_picker.search_placeholder_pickup": "पता या स्थलचिह्न खोजें",
  "map_picker.search_placeholder_drop": "अस्पताल या पता खोजें",
  "map_picker.use_current": "मेरी वर्तमान स्थिति उपयोग करें",
  "map_picker.gps_busy": "GPS लिया जा रहा है…",
  "map_picker.gps_denied": "स्थान अनुमति अस्वीकार",
  "map_picker.gps_error": "GPS नहीं मिला · कृपया मैनुअली पिन करें",
  "map_picker.searching": "खोजा जा रहा है…",
  "map_picker.no_results": "इस खोज के लिए भारत में कोई मिलान नहीं",
  "map_picker.selected_pickup": "पिकअप",
  "map_picker.selected_drop": "ड्रॉप",
  "map_picker.confirm_pickup": "पिकअप पुष्टि करें",
  "map_picker.confirm_drop": "ड्रॉप पुष्टि करें",
  "map_picker.pickup_open_button": "नक्शे पर पिकअप संपादित करें",
  "map_picker.pickup_hint": "पिकअप को सटीकता से सेट करने के लिए टैप करें",

  // Account deletion — extended
  "delete.button": "खाता हटाएँ",
  "delete.title": "क्या आप अपना खाता हटाना चाहते हैं?",
  "delete.body": "यह आपकी प्रोफ़ाइल, चिकित्सीय विवरण और आपातकालीन संपर्क को स्थायी रूप से हटा देगा। अस्पताल बिलिंग संदर्भ के लिए पिछली यात्राओं के रिकॉर्ड रखे जाते हैं, लेकिन आप तक नहीं पहुँचा जा सकता। यह वापस नहीं किया जा सकता।",
  "delete.confirm": "स्थायी रूप से हटाएँ",
  "delete.cancel": "खाता रखें",
  "delete.in_progress_title": "यात्रा प्रगति पर है",
  "delete.in_progress_body": "आप अभी एम्बुलेंस में हैं। कृपया यात्रा पूरी होने तक प्रतीक्षा करें।",
  "delete.error_generic": "खाता हटाया नहीं जा सका। कृपया फिर से कोशिश करें या सहायता से संपर्क करें।",

  "lang.title": "अपनी भाषा चुनें",
  "lang.subtitle": "आप इसे अपनी प्रोफ़ाइल से कभी भी बदल सकते हैं",
  "lang.continue": "जारी रखें",

  // Emergency type selector — extended (v1.0.15)
  "emergency.cardiac.label": "हृदय संकट",
  "emergency.cardiac.sub": "सीने में दर्द, हार्ट अटैक",
  "emergency.breathing.label": "साँस की तकलीफ़",
  "emergency.breathing.sub": "अस्थमा, ऑक्सीजन सहायता",
  "emergency.accident.label": "दुर्घटना / चोट",
  "emergency.accident.sub": "सड़क दुर्घटना, चोट",
  "emergency.pregnancy.label": "गर्भावस्था",
  "emergency.pregnancy.sub": "प्रसव, नवजात",
  "emergency.pregnancy_neonatal.pill_label": "गर्भावस्था / नवजात",
  "emergency.critical_transfer.label": "अस्पताल स्थानांतरण",
  "emergency.critical_transfer.sub": "अस्पताल से अस्पताल",
  "emergency.disclaimer.title": "आपातकालीन सहायता के बारे में",
  "emergency.disclaimer.body": "जानलेवा आपात स्थिति में आप 108 पर भी कॉल कर सकते हैं। Jeevan Rakshak एम्बुलेंस भेजने में मदद करता है, लेकिन यह आधिकारिक आपातकालीन सेवाओं का विकल्प नहीं है।",

  // Live tracking — extended for v1.0.15 SOS cascade-wait + post-completion
  "live.searching_title": "नज़दीकी एम्बुलेंस ढूँढी जा रही है",
  "live.searching_sub": "हम पास के ड्राइवरों को सूचना भेज रहे हैं और हर मिनट खोज बढ़ा रहे हैं।",
  "live.cascade_exhausted_title": "अभी कोई ड्राइवर उपलब्ध नहीं है",
  "live.cascade_exhausted_sub": "तत्काल सहायता के लिए कृपया हमारे मोबाइल {phone} पर कॉल करें।",
  "live.driver_assigned": "ड्राइवर असाइन हो गया · रास्ते में",
  "live.you_pay": "आप देंगे",
  "live.cashless_hint": "नकद रहित · पूरा होने पर ऐप में बिल",

  // Post-completion payment — extended (v1.0.15)
  "payment.title": "यात्रा पूरी हुई",
  "payment.complete_label": "✓  यात्रा पूरी",
  "payment.review_charges": "समीक्षा करें और भुगतान करें",
  "payment.hint": "अपना कूपन लागू करें और यात्रा पूरी करने के लिए भुगतान चिह्नित करें टैप करें।",
  "payment.processing": "प्रोसेस हो रहा है…",
  "payment.finish_free": "भुगतान पूर्ण · समाप्त (₹0)",
  "payment.finish_amount": "भुगतान पूर्ण · समाप्त · ₹{amount}",
  "payment.wait_for_driver_to_complete": "ड्राइवर ने अभी यात्रा पूरी नहीं की है। कुछ क्षण बाद फिर से कोशिश करें।",
  "payment.paid_label": "भुगतान",
  "payment.paid_zero": "भुगतान: ₹0",

  "history.paid": "भुगतान",
  "history.paid_zero": "भुगतान: ₹0",

  "common.cancel": "रद्द करें",
  "common.continue": "जारी रखें",
  "common.back": "वापस",

  // CR3 (2026-08): translation-coverage sweep
  "common.switch_language": "भाषा बदलें",
  "common.please_try_again": "कृपया फिर से कोशिश करें।",
  "common.try_again_short": "फिर से कोशिश करें।",
  "common.saved_title": "सेव हो गया",
  "common.save": "सहेजें",
  "common.done": "पूर्ण",

  "payment.booking_number": "बुकिंग #{id}",

  "home.banner_serving": "{hospital} से {radius} किमी के भीतर {city} में सेवा",
  "home.pickup_prefix": "पिकअप: {address}",
  "home.sos_a11y": "आपातकालीन SOS · अभी एम्बुलेंस भेजें",
  "home.sos_short": "SOS",

  "splash.tagline": "आपातकालीन एम्बुलेंस, माँगने पर।",

  "name_capture.error_too_short": "कृपया अपना पूरा नाम दर्ज करें ताकि ड्राइवर आपको पहचान सके।",
  "name_capture.error_generic": "आपका नाम सेव नहीं हो सका। कृपया फिर से कोशिश करें।",
  "name_capture.title": "हम आपको क्या कहकर बुलाएँ?",
  "name_capture.subtitle": "ताकि ड्राइवर पहुँचने पर आपको नाम से बुला सके",
  "name_capture.name_label": "आपका नाम",
  "name_capture.privacy_note": "आपका नाम केवल असाइन किए गए ड्राइवर और हमारी ऑपरेशन्स टीम के साथ साझा किया जाता है।",

  "medical.saved_body": "आपकी मेडिकल प्रोफ़ाइल अपडेट कर दी गई है।",
  "medical.save_error_title": "सेव नहीं हो सका",
  "medical.subtitle": "डिस्पैच के दौरान एम्बुलेंस टीम के साथ साझा किया जाता है",
  "medical.account_label": "अकाउंट",
  "medical.edit_details_label": "मेडिकल विवरण संपादित करें",
  "medical.name_placeholder": "जैसा अस्पताल के रिकॉर्ड में है",
  "medical.blood_group_label": "ब्लड ग्रुप",
  "medical.blood_group_placeholder": "जैसे O+",
  "medical.allergies_label": "एलर्जी / पुरानी बीमारियाँ",
  "medical.allergies_placeholder": "पेनिसिलिन, अस्थमा, आदि",
  "medical.emergency_contact_label": "आपातकालीन संपर्क",
  "medical.emergency_contact_placeholder": "परिवार या अभिभावक का फ़ोन नंबर",
  "medical.privacy_note": "यह जानकारी केवल प्रतिक्रिया देने वाली एम्बुलेंस टीम के साथ साझा की जाती है।",

  "history.trips_count": "अब तक {count} यात्राएँ",
  "history.empty_title": "अभी तक कोई बुकिंग नहीं",
  "history.empty_description": "आपकी यात्राएँ यहाँ दिखेंगी। रिफ्रेश करने के लिए नीचे खींचें।",
  "history.paid_amount": "भुगतान: ₹{amount}",
  "history.pickup_location_fallback": "पिकअप स्थान",

  "sos.confirm_title": "अभी SOS भेजें?",
  "sos.confirm_message": "हम कार्डियक प्राथमिकता के साथ निकटतम एम्बुलेंस भेजेंगे।",
  "sos.confirm_button": "SOS भेजें",
  "sos.location_unavailable_title": "स्थान उपलब्ध नहीं है",
  "sos.location_unavailable_body": "आपके स्थान के बिना हम एम्बुलेंस नहीं भेज सकते। स्थान की अनुमति दें और फिर से कोशिश करें, या फ़ोन पर बुक करने के लिए हमारे मोबाइल {phone} पर कॉल करें।",
  "sos.allow_location": "स्थान की अनुमति दें",
  "sos.call_number": "{phone} पर कॉल करें",
  "sos.failed_title": "SOS विफल",
  "sos.headline": "आपातकालीन SOS",
  "sos.headline_sub": "निकटतम एम्बुलेंस को तुरंत भेजने के लिए नीचे दिया गया बटन दबाएँ।",
  "sos.button_label": "SOS",
  "sos.info_card_title": "जानलेवा आपात स्थितियों के लिए",
  "sos.info_card_body": "यह एक उच्च-प्राथमिकता कार्डियक डिस्पैच भेजता है। दुरुपयोग करने पर आपका अकाउंट सस्पेंड किया जा सकता है।",
  "sos.cancel_and_back": "रद्द करें और वापस जाएँ",
  "sos.sending": "SOS भेजा जा रहा है…",

  "map_picker.unnamed_place": "अज्ञात स्थान",

  "book.detecting_location": "आपका लाइव स्थान खोजा जा रहा है…",
  "book.location_permission_needed": "बुक करने के लिए स्थान की अनुमति दें · एम्बुलेंस भेजने के लिए हमें इसकी आवश्यकता है।",
  "book.location_active": "लाइव स्थान सक्रिय · {lat}, {lng} (±{accuracy}मी)",
  "book.location_last_known": "आपके पिछले ज्ञात स्थान का उपयोग किया जा रहा है (GPS लॉक विफल) · फिर से कोशिश के लिए रिफ्रेश दबाएँ।",
  "book.location_failed": "स्थान का पता नहीं चला · रिफ्रेश दबाएँ, या फ़ोन पर बुक करने के लिए सहायता को कॉल करें।",
  "book.coupon_invalid": "यह कूपन इस अकाउंट के लिए मान्य नहीं है।",
  "book.out_of_area_error": "Jeevan Rakshak अभी केवल {city} में उपलब्ध है। हम अभी आपके स्थान पर डिस्पैच नहीं कर सकते।",
  "book.create_error": "बुकिंग नहीं बन सकी। कृपया फिर से कोशिश करें।",
  "book.emergency_type_label": "आपातकालीन प्रकार",
  "book.pickup_location_label": "पिकअप स्थान",
  "book.detecting_short": "खोजा जा रहा है…",
  "book.location_not_set": "स्थान सेट नहीं है",
  "book.location_share_note": "आपका लाइव स्थान ही हम एम्बुलेंस टीम के साथ साझा करते हैं।",
  "book.gps_button": "GPS",
  "book.drop_label": "ड्रॉप / अस्पताल (वैकल्पिक)",
  "book.drop_placeholder": "अस्पताल या पता",
  "book.edit_pin_on_map": "📍 नक्शे पर पिन संपादित करें",
  "book.exact_location_set": "सटीक स्थान सेट · {lat}, {lng}",
  "book.fare_offers_label": "किराया और ऑफ़र",
  "book.calculating": "गणना की जा रही है…",
  "book.fare_distance": "दूरी ({km} किमी × ₹{rate})",
  "book.fare_vehicle": "वाहन ({type} × {mult})",
  "book.fare_priority": "प्राथमिकता डिस्पैच",
  "book.fare_night_surcharge": "रात्रि अधिभार (रात 10 बजे से सुबह 6 बजे तक)",
  "book.fare_subtotal": "उप-योग",
  "book.fare_eta_label": "⏱  एम्बुलेंस इतने समय में पहुँचेगी",
  "book.fare_minimum_estimate": "न्यूनतम किराया अनुमान",
  "book.fare_no_drop_hint": "दूरी-आधारित किराया देखने के लिए ड्रॉप स्थान पिन करें। मानक दर: ₹{rate}/किमी · न्यूनतम ₹{fare}।",
  "book.coupon_applied_label": "कूपन {code}",
  "book.total_payable": "देय राशि",
  "book.remove_coupon": "कूपन हटाएँ",
  "book.coupon_code_label": "कूपन कोड",
  "book.apply": "लागू करें",
  "book.launch_offer_hint": "लॉन्च ऑफ़र का उपयोग करें: {code} (100% छूट)",
  "book.dispatching": "डिस्पैच किया जा रहा है…",
  "book.confirm_free": "पुष्टि करें और डिस्पैच करें (मुफ़्त)",
  "book.confirm_amount": "पुष्टि करें और डिस्पैच करें · ₹{amount}",
  "book.footer_note": "हम निकटतम उपलब्ध एम्बुलेंस भेजते हैं · लॉन्च ऑफ़र के दौरान नकद-रहित",

  "live.toast_driver_arrived": "ड्राइवर आ गया है",
  "live.toast_pickup_confirmed": "पिकअप की पुष्टि हो गई",
  "live.toast_trip_completed": "यात्रा पूरी हुई",
  "live.toast_cascade_exhausted": "अभी कोई ड्राइवर नहीं · कृपया सहायता मोबाइल पर कॉल करें।",
  "live.toast_booking_closed": "आपकी बुकिंग बंद कर दी गई है।",
  "live.toast_reassigning": "दूसरी एम्बुलेंस असाइन की जा रही है…",
  "live.toast_safety_closed": "सुरक्षा अलर्ट बंद कर दिया गया है। सहायता को सूचित कर दिया गया है।",
  "live.cancel_dialog_title": "यह बुकिंग रद्द करें?",
  "live.cancel_dialog_no_driver": "अभी कोई ड्राइवर असाइन नहीं हुआ है · आप स्वतंत्र रूप से रद्द कर सकते हैं।",
  "live.cancel_dialog_driver_assigned": "एक ड्राइवर रास्ते में है। उन्हें सूचित किया जाएगा कि यात्रा रद्द कर दी गई है।",
  "live.cancel_booking": "बुकिंग रद्द करें",
  "live.keep_booking": "बुकिंग बनाए रखें",
  "live.already_in_progress_title": "यात्रा पहले से प्रगति पर है",
  "live.already_in_progress_body": "आप पहले से एम्बुलेंस में हैं। यात्रा शुरू होने के बाद रद्द करना संभव नहीं है · कुछ बदल गया हो तो कृपया ड्राइवर से समन्वय करें।",
  "live.cancel_error_title": "रद्द नहीं हो सका",
  "live.toast_safety_sent": "सुरक्षा अलर्ट भेजा गया। सहायता को सूचित किया जा रहा है।",
  "live.toast_safety_stood_down": "सुरक्षा अलर्ट वापस ले लिया गया।",
  "live.looking_for_driver": "ड्राइवर खोजा जा रहा है",
  "live.timer_driver_arrives_in": "ड्राइवर इतने समय में पहुँचेगा",
  "live.timer_driver_waiting": "ड्राइवर प्रतीक्षा कर रहा है",
  "live.timer_at_pickup": "पिकअप पर",
  "live.timer_hospital_eta": "अस्पताल पहुँचने का समय",
  "live.timer_enroute": "अस्पताल की ओर जा रहे हैं",
  "live.screen_title": "लाइव ट्रैकिंग",
  "live.pickup_label": "पिकअप",
  "live.destination_hospital_label": "गंतव्य अस्पताल",
  "live.drop_label": "ड्रॉप",
  "live.free_label": "मुफ़्त",
  "live.coupon_applied_saved": "कूपन {code} लागू · ₹{amount} की बचत",
  "live.otp_tell_driver_label": "यह OTP ड्राइवर को बताएँ",
  "live.otp_label": "राइड OTP",
  "live.otp_explainer": "यात्रा शुरू करने से पहले ड्राइवर आपसे यह 4-अंकीय कोड पूछेगा।",
  "live.driver_live_label": "ड्राइवर लाइव",
  "live.live_seconds_ago": "लाइव · {seconds} सेकंड पहले",
  "live.pin_pickup": "पिकअप",
  "live.pin_driver": "ड्राइवर",
  "live.pin_hospital_fallback": "अस्पताल",
  "live.distance_label": "दूरी",
  "live.eta_label": "पहुँचने का अनुमानित समय",
  "live.map_waiting_hint": "यात्रा शुरू होने पर ड्राइवर की लाइव स्थिति इस नक्शे पर दिखाई देगी।",
  "live.open_google_maps": "Google Maps में खोलें",
  "live.driver_fallback_name": "ड्राइवर",
  "live.vehicle_pending": "वाहन असाइन होना बाकी है",
  "live.call_driver_a11y": "{name} को कॉल करें",
  "live.rating_title": "आपका ड्राइवर कैसा था?",
  "live.rating_subtitle": "आपकी रेटिंग अगले मरीज़ को सबसे अच्छी एम्बुलेंस टीम पाने में मदद करती है।",
  "live.rating_feedback_label": "क्या हमारी टीम को कुछ और बताना चाहेंगे? (वैकल्पिक)",
  "live.rating_feedback_placeholder": "क्या अच्छा रहा, क्या बेहतर हो सकता था",
  "live.rating_submit": "रेटिंग भेजें",
  "live.rating_error_title": "भेजा नहीं जा सका",
  "live.need_help_label": "मदद चाहिए?",
  "live.need_help_body": "किसी भी समय हमारी सहायता टीम से संपर्क करें · हम ड्राइवर से बात करके समन्वय करेंगे।",
  "live.trip_in_progress_note": "यात्रा प्रगति पर है · कुछ बदलना हो तो ड्राइवर से कॉल पर समन्वय करें।",
  "live.patient_condition_required": "कृपया आपातकालीन स्थिति चुनें।",
  "live.patient_save_error": "सेव नहीं हो सका। कृपया फिर से कोशिश करें।",
  "live.patient_details_label": "मरीज़ का विवरण",
  "live.patient_details_note": "हमारी टीम को मेडिकल प्रतिक्रिया तैयार करने में मदद करता है। केवल स्थिति और नोट्स अस्पताल को भेजे जाते हैं · ड्राइवर को केवल नाम दिखता है।",
  "live.patient_name_label": "मरीज़ का नाम",
  "live.patient_name_placeholder": "वैकल्पिक · ड्राइवर की मदद करता है",
  "live.patient_age_label": "उम्र",
  "live.optional_placeholder": "वैकल्पिक",
  "live.patient_gender_label": "लिंग",
  "live.gender_male": "पुरुष",
  "live.gender_female": "महिला",
  "live.gender_other": "अन्य",
  "live.patient_notes_label": "मेडिकल टीम के लिए नोट्स (वैकल्पिक)",
  "live.sending": "भेजा जा रहा है…",
  "live.send_to_medical_team": "मेडिकल टीम को भेजें",
  "live.status_headline.requested": "निकटतम एम्बुलेंस खोजी जा रही है…",
  "live.status_headline.accepted": "ड्राइवर आपकी ओर आ रहा है",
  "live.status_headline.picked_up": "अस्पताल की ओर जा रहे हैं",
  "live.status_headline.cancelled": "बुकिंग रद्द कर दी गई",
  "live.status_subline.requested": "हम उपलब्ध एम्बुलेंसों को सूचित कर रहे हैं। इसमें आमतौर पर 60 सेकंड से कम समय लगता है।",
  "live.status_subline.accepted": "नीचे अपनी एम्बुलेंस की लाइव स्थिति देखें।",
  "live.status_subline.arrived": "कृपया पिकअप स्थान पर पहुँचें। आपकी सुरक्षा हमारी प्राथमिकता है।",
  "live.status_subline.picked_up": "हम गंतव्य अस्पताल की ओर जा रहे हैं।",
  "live.status_subline.completed": "धन्यवाद। कृपया अपने अनुभव को रेट करें।",
  "live.status_subline.cancelled": "आप होम स्क्रीन से दूसरी एम्बुलेंस बुक कर सकते हैं।",
  "live.status_subline.timed_out": "कुछ समय बाद फिर से बुक करने की कोशिश करें, या सबसे तेज़ डिस्पैच के लिए SOS बटन का उपयोग करें।"

  // live.condition.* and live.patient_notes_placeholder intentionally
  // omitted here — clinical vocabulary deferred pending medical review (see
  // file header); they fall back to their English `en` values automatically.
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
  // CR3 (2026-08): sync to the server so push-notification templates
  // localize too (see services/api-server/src/push-i18n.ts). Best-effort —
  // silently no-ops pre-login (no token yet); the next toggle after login
  // (or the next natural profile update) catches it up.
  me.update({ preferredLang: next }).catch(() => {});
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
