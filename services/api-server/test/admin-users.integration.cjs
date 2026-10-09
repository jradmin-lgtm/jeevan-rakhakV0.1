const assert = require('assert/strict');
const root = require('path').resolve(__dirname, '../../..');
const base = process.env.TEST_API_BASE || 'http://127.0.0.1:4100';
for (const url of [base, process.env.DATABASE_URL]) if (!url || !['localhost', '127.0.0.1', 'postgres'].includes(new URL(url).hostname)) throw Error('Local isolated services required');
const sql = require(root + '/packages/db/node_modules/postgres')(process.env.DATABASE_URL);
const headers = { 'x-admin-key': process.env.ADMIN_API_KEY };
async function read(path) {
  const res = await fetch(base + '/api/v1/admin/' + path, { headers });
  assert.equal(res.status, 200); return res.json();
}
(async () => {
  const phonePrefix = '+91' + String(Date.now()).slice(-8);
  await sql`INSERT INTO users (phone, name, created_at) SELECT ${phonePrefix} || lpad(n::text, 2, '0'), 'Isolated pagination fixture', now() + n * interval '1 microsecond' FROM generate_series(1, 20) n`;
  let cursor = '', total, example;
  const seen = new Set();
  do {
    const data = await read('users?' + new URLSearchParams({ limit: 17, ...(cursor ? { cursor } : {}) }));
    total = data.total;
    for (const user of data.users) { assert.ok(!seen.has(user.id)); seen.add(user.id); example = user; }
    cursor = data.nextCursor || '';
  } while (cursor);
  assert.ok(total > 17); assert.equal(seen.size, total);
  const found = await read('users?' + new URLSearchParams({ q: example.phone }));
  assert.ok(found.users.some(u => u.id === example.id));
  for (const params of [{ cursor: 'invalid' }, { limit: 501 }]) {
    const res = await fetch(base + '/api/v1/admin/users?' + new URLSearchParams(params), { headers });
    assert.equal(res.status, 400);
  }
  const suffix = Date.now();
  const [u] = await sql`INSERT INTO users (phone, name) VALUES (${'+9141'+suffix}, 'Lifetime test user') RETURNING id`;
  const [d] = await sql`INSERT INTO drivers (phone, name) VALUES (${'+9142'+suffix}, 'Lifetime test driver') RETURNING id`;
  await sql`INSERT INTO bookings (user_id, driver_id, status, emergency_type, pickup_lat, pickup_lng, fare_final_inr, payable_inr, paid_inr, paid_at) SELECT ${u.id}, ${d.id}, 'COMPLETED', 'OPD_AMBULANCE', 28.4, 79.4, 100, 80, 80, now() FROM generate_series(1, 105)`;
  const user = await read('users/' + u.id), driver = await read('drivers/' + d.id);
  assert.equal(user.bookings.length, 100); assert.equal(driver.bookings.length, 100);
  assert.equal(user.totals.total, 105); assert.equal(driver.totals.total, 105);
  assert.equal(user.totals.lifetimePayableInr, 8400); assert.equal(driver.totals.lifetimeEarningsInr, 8400);
  if (!process.env.JR_BOOKING_DELETE_PASSWORD) {
    const before = (await read('users/' + u.id)).bookings[0].id;
    const res = await fetch(base + '/api/v1/admin/bookings/' + before + '/delete', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'dev-delete-password-change-in-prod' }) });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'booking_deletion_not_configured');
    assert.equal((await read('users/' + u.id)).totals.total, 105, 'Missing deletion secret cannot remove a booking');
  }
  console.log(JSON.stringify({ pass: true, users: seen.size, checks: ['complete user pagination', 'older user search', 'invalid queries', 'user and driver lifetime totals beyond latest 100 rides', 'unconfigured deletion refuses the development password'] }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sql.end());
