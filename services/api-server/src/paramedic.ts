/**
 * CR#3 decision: the driver IS the paramedic for the pilot. Isolated here so
 * introducing a real paramedic entity later is a one-function change — no
 * API/UI edits. `driver` is the joined driver row (name, vehicleNumber).
 */
export function resolveParamedic(driver: { name?: string | null } | null | undefined): string | null {
  return driver?.name ?? null;
}
