import { EmergencyType } from "../api";

// v1.0.15: emergency labels are translation keys so the option list re-renders
// in Hindi when the locale flips mid-screen. Extracted from BookAmbulanceScreen
// (2026-08-17) so SosScreen's category picker shares the exact same 5 options
// instead of duplicating them.
export const EMERGENCY_KEYS: { key: EmergencyType; labelKey: string; subKey: string; emoji: string }[] = [
  { key: "CARDIAC",                    labelKey: "emergency.cardiac.label",          subKey: "emergency.cardiac.sub",          emoji: "♥" },
  { key: "BREATHING_DISTRESS",         labelKey: "emergency.breathing.label",        subKey: "emergency.breathing.sub",        emoji: "≈" },
  { key: "ACCIDENT_TRAUMA",            labelKey: "emergency.accident.label",         subKey: "emergency.accident.sub",         emoji: "✚" },
  { key: "PREGNANCY_NEONATAL",         labelKey: "emergency.pregnancy.label",        subKey: "emergency.pregnancy.sub",        emoji: "✿" },
  { key: "GENERAL_CRITICAL_TRANSFER",  labelKey: "emergency.critical_transfer.label", subKey: "emergency.critical_transfer.sub", emoji: "→" }
];
