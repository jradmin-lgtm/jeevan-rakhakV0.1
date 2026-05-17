/**
 * Centralized ride-status display helpers. v1.0.12 unified the pretty
 * labels across every admin surface (list, detail, user/driver pages,
 * live dashboard) so we never show raw `PICKED_UP` enums to operators
 * again. If you want to rename a label, do it here once.
 */

export function prettyStatus(s: string): string {
  switch (s) {
    case "REQUESTED": return "Searching for ambulance";
    case "ACCEPTED": return "Ride accepted";
    case "ARRIVED": return "Driver arrived at pickup";
    case "PICKED_UP": return "Driving to hospital";
    case "COMPLETED": return "Completed";
    case "CANCELLED": return "Cancelled";
    case "TIMED_OUT": return "No driver responded";
    default: return s;
  }
}

/**
 * Operator-friendly short labels for tight UI like list-row pills.
 */
export function shortStatus(s: string): string {
  switch (s) {
    case "REQUESTED": return "Searching";
    case "ACCEPTED": return "Accepted";
    case "ARRIVED": return "At pickup";
    case "PICKED_UP": return "To hospital";
    case "COMPLETED": return "Completed";
    case "CANCELLED": return "Cancelled";
    case "TIMED_OUT": return "No driver";
    default: return s;
  }
}

export function prettyEmergency(t: string): string {
  switch (t) {
    case "ACCIDENT_TRAUMA": return "Accident / Trauma";
    case "CARDIAC": return "Cardiac";
    case "BREATHING_DISTRESS": return "Breathing distress";
    case "PREGNANCY_NEONATAL": return "Pregnancy / Neonatal";
    case "GENERAL_CRITICAL_TRANSFER": return "Critical transfer";
    default: return t;
  }
}

/**
 * Paramedic-assessment summary used by the booking list pill + detail
 * page badge. Returns a status string + variant for styling.
 *
 * - `submitted-risk`: assessment exists and immediateRisk flag is set
 * - `submitted`: assessment exists, no immediate risk
 * - `awaiting`: trip past ARRIVED but no assessment yet
 * - `na`: trip hasn't reached the paramedic stage (REQUESTED / ACCEPTED)
 *         OR was cancelled before pickup
 */
export type AssessmentBadge = {
  label: string;
  variant: "submitted" | "risk" | "awaiting" | "na";
};

export function assessmentBadge(
  status: string,
  assessment: Record<string, any> | null | undefined
): AssessmentBadge {
  if (assessment) {
    if (assessment.immediateRisk) {
      return { label: "🚨 Immediate risk", variant: "risk" };
    }
    return { label: "✓ Submitted", variant: "submitted" };
  }
  if (["ARRIVED", "PICKED_UP", "COMPLETED"].includes(status)) {
    return { label: "Awaiting paramedic", variant: "awaiting" };
  }
  return { label: "—", variant: "na" };
}
