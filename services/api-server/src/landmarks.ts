export type NearbyLandmark = { id: string; name: string; address: string; distanceMeters: number; label: string };

export function rankNearbyLandmarks(results: unknown[], lat: number, lng: number): NearbyLandmark[] {
  const radians = (v: number) => v * Math.PI / 180;
  const candidates: Array<NearbyLandmark & { lat: number; lng: number; prominence: number }> = [];
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const place = raw as Record<string, any>;
    const position = place.geometry?.location;
    if (typeof place.name !== "string" || !place.name.trim() || typeof place.place_id !== "string") continue;
    if (!Number.isFinite(position?.lat) || !Number.isFinite(position?.lng) || Math.abs(position.lat) > 90 || Math.abs(position.lng) > 180) continue;
    if (!Array.isArray(place.types) || !place.types.some((t: string) => ["point_of_interest", "establishment", "hospital"].includes(t))) continue;
    const a = Math.sin(radians(position.lat - lat) / 2) ** 2 + Math.cos(radians(lat)) * Math.cos(radians(position.lat)) * Math.sin(radians(position.lng - lng) / 2) ** 2;
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
    if (distance > 2000) continue;
    const name = place.name.trim().slice(0, 160);
    const address = typeof place.vicinity === "string" ? place.vicinity.trim().slice(0, 200) : "";
    const reviews = Number.isFinite(place.user_ratings_total) && place.user_ratings_total > 0 ? place.user_ratings_total : 0;
    const prominence = Math.log1p(reviews) / (1 + distance / 500);
    candidates.push({ prominence, lat: position.lat, lng: position.lng, id: place.place_id, name, address, distanceMeters: Math.round(distance), label: name });
  }
  candidates.sort((a, b) => b.prominence - a.prominence || a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
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
  return selected.map(({ lat: _lat, lng: _lng, prominence: _prominence, ...landmark }) => landmark);
}


// Reverse-geocoded address components identify areas without parsing comma order.
// Distances refer to the returned nearby address, never an invented area centre.
export function resolvePickupAreas(results: unknown[], lat: number, lng: number): NearbyLandmark[] {
  const areaTypes = ["sublocality_level_1", "neighborhood", "sublocality_level_2", "sublocality_level_3", "sublocality_level_4", "sublocality_level_5", "sublocality", "locality"];
  const normalise = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const candidates: Array<NearbyLandmark & { priority: number }> = [];
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const result = raw as Record<string, any>;
    if (!Array.isArray(result.address_components) || !Array.isArray(result.types)) continue;
    // Postal and administrative summaries can include a city far from the pickup.
    if (!result.types.some((t: string) => ["street_address", "premise", "subpremise", "route", "plus_code", "point_of_interest", ...areaTypes].includes(t))) continue;
    const components = result.address_components.filter((c: any) => c && typeof c.long_name === "string" && Array.isArray(c.types));
    const broadNames = new Set(components.filter((c: any) => c.types.some((t: string) => typeof t === "string" && (t === "country" || t.startsWith("administrative_area_level_")))).map((c: any) => normalise(c.long_name)));
    const hasSubarea = components.some((c: any) => c.types.some((t: string) => areaTypes.slice(0, -1).includes(t)));
    for (const component of components) {
      const priority = areaTypes.findIndex(t => component.types.includes(t));
      const name = component.long_name.trim().slice(0, 160);
      if (priority < 0 || !name || broadNames.has(normalise(name))) continue;
      // A city is not another pickup-area option when this address has a neighbourhood.
      if (component.types.includes("locality") && hasSubarea) continue;
      const [candidate] = rankNearbyLandmarks([{ place_id: `${result.place_id}:area:${name}`, name, vicinity: result.formatted_address, geometry: result.geometry, types: ["point_of_interest"] }], lat, lng);
      if (typeof result.place_id !== "string" || !candidate) continue;
      candidates.push({ ...candidate, priority });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return candidates.filter(item => {
    const key = normalise(item.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5).map(({ priority: _priority, ...item }) => item);
}
