// Small guarded formatters for user-facing values.

/**
 * Format a timestamp for display via toLocaleString, guarded against bad input.
 *
 * The raw `new Date(value).toLocaleString()` pattern renders the literal string
 * "Invalid Date" when `value` is null/undefined/malformed (a missing or garbled
 * server timestamp). This returns the em dash placeholder "—" in that case so a
 * row/bubble never shows "Invalid Date" to a patient.
 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value == null) return "—";
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString();
}
