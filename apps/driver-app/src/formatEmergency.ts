export function prettyEmergency(emergencyType: string, translate: (key: string) => string): string {
  switch (emergencyType) {
    case "ACCIDENT_TRAUMA": return translate("emergency.accident_trauma");
    case "CARDIAC": return translate("emergency.cardiac");
    case "BREATHING_DISTRESS": return translate("emergency.breathing_distress");
    case "PREGNANCY_NEONATAL": return translate("emergency.pregnancy_neonatal");
    case "REFERRAL_AMBULANCE": return translate("emergency.referral");
    case "OPD_AMBULANCE": return translate("emergency.opd");
    case "GENERAL_CRITICAL_TRANSFER": return translate("emergency.critical_transfer");
    default: return emergencyType;
  }
}
