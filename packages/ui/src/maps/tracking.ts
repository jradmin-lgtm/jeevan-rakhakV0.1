export type TrackingFix = { lat: number; lng: number; ts: number };

export function newerFix(current: TrackingFix | null, next: TrackingFix, now = Date.now()): TrackingFix | null {
  if (![next.lat, next.lng, next.ts].every(Number.isFinite)
    || Math.abs(next.lat) > 90 || Math.abs(next.lng) > 180
    || next.ts > now + 10_000 || now - next.ts > 120_000
    || (current && next.ts <= current.ts)) return current;
  return next;
}

function km(a: [number, number], b: [number, number]): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b[0] - a[0]) * rad / 2) ** 2
    + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin((b[1] - a[1]) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Trim a route at the nearest projected segment. Keep the provider estimate
// when the fix is off-route, until a refreshed route arrives.
export function remainingRoute(path: Array<[number, number]> | null, position: { lat: number; lng: number } | null, estimate: { km: number; min: number } | null) {
  if (!path || path.length < 2 || !position || !estimate) return estimate;
  const p: [number, number] = [position.lat, position.lng];
  let total = 0;
  const lengths = path.slice(1).map((b, i) => { const length = km(path[i], b); total += length; return length; });
  if (total <= 0) return estimate;
  let nearest = Infinity, remaining = total, traversed = 0;
  for (let i = 0; i < lengths.length; i++) {
    const a = path[i], b = path[i + 1], x = (b[1] - a[1]) * Math.cos(p[0] * Math.PI / 180), y = b[0] - a[0];
    const px = (p[1] - a[1]) * Math.cos(p[0] * Math.PI / 180), py = p[0] - a[0];
    const t = Math.max(0, Math.min(1, (px * x + py * y) / (x * x + y * y || 1)));
    const projected: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const distance = km(p, projected);
    if (distance < nearest) { nearest = distance; remaining = total - traversed - lengths[i] * t; }
    traversed += lengths[i];
  }
  if (nearest > 0.15) return estimate;
  const ratio = Math.max(0, Math.min(1, remaining / total));
  return { km: estimate.km * ratio, min: Math.max(0, Math.round(estimate.min * ratio)) };
}
