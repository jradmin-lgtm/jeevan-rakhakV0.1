export type NearbyLandmark = { id: string; name: string; address: string; distanceMeters: number; label: string };

export function rankNearbyLandmarks(results: unknown[], lat: number, lng: number): NearbyLandmark[] {
  const radians = (v: number) => v * Math.PI / 180;
  const candidates: Array<NearbyLandmark & { lat: number; lng: number }> = [];
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const place = raw as Record<string, any>;
    const position = place.geometry?.location;
    if (typeof place.name !== "string" || !place.name.trim() || typeof place.place_id !== "string") continue;
    if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) continue;
    if (!Array.isArray(place.types) || !place.types.some((t: string) => ["point_of_interest", "establishment", "hospital", "locality", "sublocality", "neighborhood", "sublocality_level_1", "sublocality_level_2"].includes(t))) continue;
    const a = Math.sin(radians(position.lat - lat) / 2) ** 2 + Math.cos(radians(lat)) * Math.cos(radians(position.lat)) * Math.sin(radians(position.lng - lng) / 2) ** 2;
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
    if (distance > 2000) continue;
    const name = place.name.trim().slice(0, 160);
    const address = typeof place.vicinity === "string" ? place.vicinity.trim().slice(0, 200) : "";
    candidates.push({ lat: position.lat, lng: position.lng, id: place.place_id, name, address, distanceMeters: Math.round(distance), label: (address && !address.toLowerCase().startsWith(name.toLowerCase()) ? `${name}, ${address}` : address || name).slice(0, 240) });
  }
  candidates.sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
  const ids = new Set<string>();
  const names = new Set<string>();
  const distinct = candidates.filter(item => {
    const name = item.name.toLocaleLowerCase().replace(/\s+/g, " ");
    if (ids.has(item.id) || names.has(name)) return false;
    ids.add(item.id); names.add(name); return true;
  });
  const selected: typeof candidates = [];
  for (const item of distinct) {
    // Avoid filling the list with several listings for one hospital campus.
    // Manual entry remains available for a specific gate or department.
    const sameSite = selected.some(other => {
      const north = radians(item.lat - other.lat) * 6371000;
      const east = radians(item.lng - other.lng) * 6371000 * Math.cos(radians(item.lat));
      return Math.hypot(north, east) < 80;
    });
    if (!sameSite) selected.push(item);
    if (selected.length === 5) break;
  }
  return selected.map(({ lat: _lat, lng: _lng, ...landmark }) => landmark);
}
