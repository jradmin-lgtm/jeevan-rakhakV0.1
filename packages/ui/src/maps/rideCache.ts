type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };
type Ride = { id: string; status: string };
export type CachedRoadRoute = {
  provider: "osrm"; destination: string; coords: Array<[number, number]>;
  distanceKm: number; durationMin: number; savedAt: number;
};
export type CachedRide<B extends Ride> = {
  version: 1; owner: string; booking: B; savedAt: number;
  contact?: Record<string, any> | null;
  position?: { lat: number; lng: number; ts: number } | null;
  route?: CachedRoadRoute | null;
};
const active = new Set(["REQUESTED", "ACCEPTED", "ARRIVED", "PICKED_UP"]);

// Inject storage so both native apps use the same owner and race protections.
export function createRideCache<B extends Ride>(storage: Storage, key: string, owner: () => Promise<string | null>) {
  let serial: Promise<unknown> = Promise.resolve();
  function locked<T>(operation: () => Promise<T>): Promise<T> {
    const next = serial.then(operation);
    serial = next.catch(error => console.error("[ride-cache] storage operation failed", error));
    return next;
  }
  async function read(): Promise<CachedRide<B> | null> {
    const identity = await owner();
    if (!identity) throw new Error("Signed-in profile required for offline ride storage");
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as CachedRide<B>;
    if (value.version !== 1 || value.owner !== identity || !value.booking?.id || !Number.isFinite(value.savedAt)) throw new Error("Offline ride does not belong to this account or is damaged");
    if (!active.has(value.booking.status)) { await storage.removeItem(key); return null; }
    return value;
  }
  async function write(value: CachedRide<B>) {
    if (await owner() !== value.owner) throw new Error("Account changed before the offline ride could be saved");
    await storage.setItem(key, JSON.stringify(value));
  }
  return {
    load: () => locked(read),
    saveBooking: (booking: B | null) => locked(async () => {
      const identity = await owner();
      if (!identity) throw new Error("Signed-in profile required for offline ride storage");
      const current = await read();
      if (!booking || !active.has(booking.status)) {
        if (!booking || current?.booking.id === booking.id) await storage.removeItem(key);
        return;
      }
      const existing = current?.booking.id === booking.id ? current : null;
      await write({ ...existing, version: 1, owner: identity, booking, savedAt: Date.now() });
    }),
    saveDetails: (bookingId: string, details: Pick<CachedRide<B>, "contact" | "position">) => locked(async () => {
      const current = await read();
      if (!current || current.booking.id !== bookingId) return;
      const next = { ...current };
      if (details.contact !== undefined) next.contact = details.contact;
      if (details.position && (!current.position || details.position.ts > current.position.ts)) {
        const { lat, lng, ts } = details.position;
        if (![lat, lng, ts].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || ts > Date.now() + 10_000) throw new Error("Cannot save an invalid ride position");
        next.position = details.position;
      }
      await write(next);
    }),
    saveRoute: (bookingId: string, route: CachedRoadRoute) => locked(async () => {
      if (route.provider !== "osrm" || !Number.isFinite(route.distanceKm) || !Number.isFinite(route.durationMin) || route.distanceKm < 0 || route.durationMin < 0 || route.coords.length < 2 || route.coords.some(([lat, lng]) => !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)) throw new Error("Cannot cache an invalid road route");
      const current = await read();
      if (!current || current.booking.id !== bookingId) return;
      const step = Math.max(1, Math.ceil(route.coords.length / 5000));
      const coords = route.coords.filter((_, index) => index % step === 0 || index === route.coords.length - 1);
      await write({ ...current, route: { ...route, coords } });
    }),
    clear: () => locked(() => storage.removeItem(key))
  };
}
