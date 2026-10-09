const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const root = resolve(__dirname, '../../..');
const env = process.env;
if (!env.DATABASE_URL || !env.JWT_SECRET || !env.TEST_IDENTITIES_FILE) throw Error('Local database, signing secret and fixture identities are required');
assert.ok(['localhost', '127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname), 'Only isolated local database permitted');
const base = env.TEST_API_BASE || 'http://localhost:4100';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Only isolated local API permitted');
const sql = require(root + '/packages/db/node_modules/postgres')(env.DATABASE_URL);
const ids = JSON.parse(fs.readFileSync(env.TEST_IDENTITIES_FILE));
const driverId = ids.drivers[1].id;
let bookingId;
let otherBookingId;
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(sub, role) {
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ sub, role, exp: Math.floor(Date.now() / 1000) + 600 });
  return head + '.' + body + '.' + crypto.createHmac('sha256', env.JWT_SECRET).update(head + '.' + body).digest('base64url');
}
const results = [];
function check(name, condition) { assert.ok(condition, name); results.push({ name, pass: true }); console.log('PASS', name); }
async function request(points, auth = token(driverId, 'driver')) {
  const r = await fetch(base + '/api/v1/driver/location-batch', { method: 'POST', headers: { authorization: 'Bearer ' + auth, 'content-type': 'application/json' }, body: JSON.stringify({ points }) });
  return { status: r.status, body: await r.json() };
}
async function main() {
  const fixtures = await sql`SELECT id, driver_id FROM bookings WHERE id IN ${sql(ids.bookingIds)}`;
  bookingId = fixtures.find(row => row.driver_id === driverId)?.id;
  otherBookingId = fixtures.find(row => row.driver_id !== driverId)?.id;
  assert.ok(bookingId && otherBookingId, 'Assigned and unrelated fixture rides required');
  const now = Date.now();
  const historical = { bookingId, lat: 28.4801, lng: 79.4401, ts: now - 600000 };
  const current = { bookingId, lat: 28.482, lng: 79.442, ts: now };
  const response = await request([historical, current]);
  check('Offline history and current fix accepted together', response.status === 200 && response.body.accepted === 2);
  const rows = await sql`SELECT recorded_at FROM driver_locations WHERE driver_id = ${driverId} AND booking_id = ${bookingId} AND recorded_at IN (${new Date(historical.ts).toISOString()}, ${new Date(current.ts).toISOString()})`;
  check('Original capture times preserved', rows.length === 2 && rows.some(r => +r.recorded_at === historical.ts) && rows.some(r => +r.recorded_at === current.ts));
  await Promise.all(Array.from({ length: 4 }, () => request([historical, current, current])));
  const [count] = await sql`SELECT COUNT(*)::int AS n FROM driver_locations WHERE driver_id = ${driverId} AND booking_id = ${bookingId} AND recorded_at IN (${new Date(historical.ts).toISOString()}, ${new Date(current.ts).toISOString()})`;
  check('Concurrent retries and duplicate points are idempotent', count.n === 2);
  await request([{ ...historical, lat: 10, ts: now - 700000 }]);
  const [driver] = await sql`SELECT last_lat, last_seen_at FROM drivers WHERE id = ${driverId}`;
  check('History cannot move live position or freshness backward', driver.last_lat === current.lat && +driver.last_seen_at === current.ts);
  const expired = await request([{ ...historical, ts: now - 25 * 3600000 }]);
  check('Expired history explicitly reported', expired.status === 200 && expired.body.accepted === 0 && expired.body.expired === 1);
  check('Future timestamps rejected', (await request([{ ...current, ts: now + 60000 }])).status === 400);
  check('Out-of-range coordinates rejected', (await request([{ ...current, lat: 100 }])).status === 400);
  check('Batch size bounded', (await request(Array.from({ length: 101 }, () => current))).status === 400);
  check('Other driver cannot backfill this ride', (await request([current], token(ids.drivers[0].id, 'driver'))).status === 403);
  check('User cannot upload driver history', (await request([current], token(ids.users[0].id, 'user'))).status === 403);
  const beforeMixed = now - 800000;
  check('Mixed ownership batch refused', (await request([{ ...current, ts: beforeMixed }, { ...current, bookingId: otherBookingId }])).status === 403);
  const [mixed] = await sql`SELECT COUNT(*)::int AS n FROM driver_locations WHERE driver_id = ${driverId} AND recorded_at = ${new Date(beforeMixed).toISOString()}`;
  check('Rejected batch has no partial writes', mixed.n === 0);
  if (env.TEST_RESULTS_FILE) fs.writeFileSync(env.TEST_RESULTS_FILE, JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sql.end());
