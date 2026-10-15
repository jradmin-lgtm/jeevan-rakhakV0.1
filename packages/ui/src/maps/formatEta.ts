/** Display precision only. Keep the provider's original minutes for routing calculations. */
export function formatEta(minutes: number | null | undefined, language: "en" | "hi" = "en"): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) {
    return language === "hi" ? "उपलब्ध नहीं" : "Unavailable";
  }
  if (minutes < 1) return language === "hi" ? "1 मिनट से कम" : "<1 min";
  const rounded = Math.round(minutes);
  return language === "hi" ? `लगभग ${rounded} मिनट` : `~${rounded} min`;
}
