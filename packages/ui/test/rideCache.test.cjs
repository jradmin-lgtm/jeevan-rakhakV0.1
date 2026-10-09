const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exported = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/maps/rideCache.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exported);
function rig() {
  const data = new Map(); let identity = 'driver-one';
  const storage = { getItem: async key => data.get(key) ?? null, setItem: async (key, value) => data.set(key, value), removeItem: async key => data.delete(key) };
  const cache = () => exported.createRideCache(storage, 'ride', async () => identity);
  return { cache, data, storage, user: value => { identity = value; } };
}
const booking = { id: 'ride-one', status: 'ACCEPTED', pickupLandmark: 'North gate', pickupLat: 28, pickupLng: 79 };
const road = { provider: 'osrm', destination: 'pickup:28:79', coords: [[28,79],[28.01,79.01]], distanceKm: 2, durationMin: 7, savedAt: Date.now() };
test('cold restart restores ride, landmark, contact, original GPS time and road route', async () => {
  const r = rig(), cache = r.cache();
  await cache.saveBooking(booking);
  const position = { lat: 28, lng: 79, ts: Date.now()-300_000 };
  await cache.saveDetails(booking.id, { contact: { phone: 'test-only' }, position });
  await cache.saveRoute(booking.id, road);
  const restored = await r.cache().load();
  assert.equal(restored.booking.pickupLandmark, 'North gate');
  assert.equal(restored.contact.phone, 'test-only');
  assert.deepEqual(restored.position, position);
  assert.deepEqual(restored.route, road);
});
test('another account cannot read saved ride data', async () => {
  const r = rig(); await r.cache().saveBooking(booking); r.user('driver-two');
  await assert.rejects(r.cache().load(), /does not belong/);
  await r.cache().clear(); assert.equal(await r.cache().load(), null);
});
test('concurrent booking, contact and route updates retain all fields', async () => {
  const r = rig(), cache = r.cache();
  await cache.saveBooking(booking);
  await Promise.all([cache.saveDetails(booking.id, { contact: { phone: 'test-only' } }), cache.saveRoute(booking.id, road), cache.saveBooking({ ...booking, status: 'ARRIVED' })]);
  const saved = await cache.load();
  assert.equal(saved.booking.status, 'ARRIVED'); assert.equal(saved.contact.phone, 'test-only'); assert.equal(saved.route.destination, road.destination);
});
test('terminal ride clears cache and late detail updates cannot recreate it', async () => {
  const r = rig(), cache = r.cache(); await cache.saveBooking(booking);
  await cache.saveBooking({ ...booking, status: 'COMPLETED' });
  await cache.saveDetails(booking.id, { contact: { phone: 'late' } });
  await cache.saveRoute(booking.id, road); assert.equal(await cache.load(), null);
});
test('a new ride never inherits the previous route or contact', async () => {
  const r = rig(), cache = r.cache(); await cache.saveBooking(booking);
  await cache.saveRoute(booking.id, road); await cache.saveDetails(booking.id, { contact: { phone: 'old' } });
  await cache.saveBooking({ ...booking, id: 'ride-two' });
  await cache.saveBooking({ ...booking, status: 'COMPLETED' });
  const saved = await cache.load(); assert.equal(saved.booking.id, 'ride-two'); assert.equal(saved.route, undefined); assert.equal(saved.contact, undefined);
});
test('Google geometry and malformed OSRM routes cannot enter offline storage', async () => {
  const r = rig(), cache = r.cache(); await cache.saveBooking(booking);
  for (const route of [{ ...road, provider: 'google' }, { ...road, durationMin: NaN }, { ...road, coords: [[91,79],[28,79]] }]) await assert.rejects(cache.saveRoute(booking.id, route), /invalid road route/);
  assert.equal((await cache.load()).route, undefined);
});
test('older GPS does not overwrite last known location and storage failures reject', async () => {
  const r = rig(), cache = r.cache(); await cache.saveBooking(booking);
  const ts = Date.now(); await cache.saveDetails(booking.id, { position: { lat: 28, lng: 79, ts } });
  await cache.saveDetails(booking.id, { position: { lat: 29, lng: 80, ts: ts-1 } });
  assert.equal((await cache.load()).position.lat, 28);
  r.storage.setItem = async () => { throw new Error('device storage full'); };
  await assert.rejects(cache.saveBooking(booking), /storage full/);
});
