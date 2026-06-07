import { redirect } from "next/navigation";

// The standalone Safety Alerts list was merged into the unified Alerts hub
// (one sidebar entry, two banner sections). The list now lives at /alerts on
// the Emergency Safety Alerts banner; the per-alert detail stays at
// /safety-alerts/[id] (linked from the list rows + the top safety banner).
export default function SafetyAlertsRedirect() {
  redirect("/alerts");
}
