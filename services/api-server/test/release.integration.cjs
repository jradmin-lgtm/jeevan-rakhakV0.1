const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert/strict');
const root = require('path').resolve(__dirname, '../../..');
const env = process.env;
if (!env.DATABASE_URL || !env.JWT_SECRET) throw new Error('DATABASE_URL and JWT_SECRET required');
const dbHost = new URL(env.DATABASE_URL).hostname;
if (!['localhost','127.0.0.1','postgres'].includes(dbHost)) throw new Error('Integration tests only run on an isolated local database');
const sql = require(root + '/packages/db/node_modules/postgres')(env.DATABASE_URL);
const base = process.env.TEST_API_BASE ?? 'http://127.0.0.1:4100';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local API required');
const results = [];
function jwt(claims) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${crypto.createHmac('sha256', env.JWT_SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
async function request(path, token, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
function check(name, condition, detail) { assert.ok(condition, `${name}: ${JSON.stringify(detail)}`); results.push({ name, pass: true }); console.log('PASS', name); }
async function main() {
  const hospitals = await sql`SELECT id FROM hospitals ORDER BY is_default DESC`;
  const [other] = await sql`INSERT INTO hospitals(name, lat, lng, active, portal_enabled, portal_password_hash) VALUES ('Release test other hospital', 28.5, 79.5, true, true, 'test-only') RETURNING id`;
  await sql`UPDATE hospitals SET portal_enabled = true, portal_password_hash = 'test-only' WHERE id = ${hospitals[0].id}`;
  const users = [];
  for (let i = 0; i < 5; i++) {
    const [user] = await sql`INSERT INTO users(phone,name,is_demo) VALUES (${`+91900000${Date.now().toString().slice(-5)}${i}`}, ${`Release test user ${i}`}, true) RETURNING id`;
    users.push({ ...user, token: jwt({ sub: user.id, role: 'user' }) });
  }
  const drivers = [];
  for (let i = 0; i < 3; i++) {
    const [driver] = await sql`INSERT INTO drivers(phone,name,is_demo,kyc_verified,status,last_lat,last_lng,last_seen_at) VALUES (${`+91800000${Date.now().toString().slice(-5)}${i}`}, ${`Release test driver ${i}`}, true, true, 'OFFLINE', 28.48127, 79.443282, now()) RETURNING id`;
    drivers.push({ ...driver, token: jwt({ sub: driver.id, role: 'driver' }) });
  }
  const input = { emergencyType: 'REFERRAL_AMBULANCE', pickupLat: 28.48127, pickupLng: 79.443282, pickupAddress: 'Local release test pickup', dropLat: 28.50, dropLng: 79.46, dropAddress: 'Local release test destination' };
  const first = await request('/api/v1/bookings', users[0].token, input);
  check('Referral booking mapping', first.status === 201 && first.body.booking.emergencyType === 'REFERRAL_AMBULANCE', first);
  const second = await request('/api/v1/bookings', users[1].token, { ...input, emergencyType: 'OPD_AMBULANCE' });
  check('OPD booking mapping and destination coordinates', second.status === 201 && second.body.booking.dropLat === input.dropLat && second.body.booking.dropLng === input.dropLng, second);
  const b1 = first.body.booking, b2 = second.body.booking;
  const patient = await request(`/api/v1/bookings/${b1.id}/patient-info`, users[0].token, { patientName: 'Test patient', patientAge: 0, patientConditions: ['Breathing Difficulty'], patientNotes: 'User-reported test note', attendantName: 'Test attendant', attendantRelation: 'Parent' });
  check('Attendant persists per ride', patient.status === 200 && patient.body.booking.attendantName === 'Test attendant' && patient.body.booking.attendantRelation === 'Parent', patient);
  check('Unauthenticated booking rejected', (await request(`/api/v1/bookings/${b1.id}`)).status === 401);
  check('Unrelated user rejected', (await request(`/api/v1/bookings/${b1.id}`, users[1].token)).status === 403);
  check('Malformed UUID yields client error', (await request('/api/v1/bookings/not-a-uuid', users[0].token)).status === 400);
  check('Partial destination coordinate rejected', (await request('/api/v1/fares/quote', users[0].token, { pickupLat: 28.48, pickupLng: 79.44, dropLat: 28.5 })).status === 400);
  check('Removed user safety alert rejected', (await request('/api/v1/safety/raise', users[0].token, { bookingId: b1.id, reason: 'test' })).status === 403);
  check('Out-of-range fare coordinates rejected', (await request('/api/v1/fares/quote', users[0].token, { pickupLat: 999, pickupLng: 999 })).status === 400);
  const accept = await Promise.all([b1, b2].map(b => request(`/api/v1/bookings/${b.id}/accept`, drivers[0].token, {})));
  check('One driver cannot accept two concurrent bookings', accept.filter(r => r.status === 200).length === 1 && accept.filter(r => r.status === 409).length === 1, accept);
  const winner = accept[0].status === 200 ? b1 : b2;
  const loser = winner.id === b1.id ? b2 : b1;
  check('Second driver independently accepts other booking', (await request(`/api/v1/bookings/${loser.id}/accept`, drivers[1].token, {})).status === 200);
  const visible = await request(`/api/v1/bookings/${winner.id}`, drivers[0].token);
  check('Driver cannot read pickup OTP or clinical fields', visible.status === 200 && !['rideOtpCode', 'patientConditions', 'patientNotes', 'paramedicAssessment'].some(k => k in visible.body.booking), visible);
  check('Cannot complete before pickup', (await request(`/api/v1/bookings/${winner.id}/complete`, drivers[0].token, {})).status === 409);
  check('Arrive transition', (await request(`/api/v1/bookings/${winner.id}/arrived`, drivers[0].token, {})).status === 200);
  check('Repeated arrive rejected', (await request(`/api/v1/bookings/${winner.id}/arrived`, drivers[0].token, {})).status === 409);
  check('Wrong pickup OTP rejected', (await request(`/api/v1/bookings/${winner.id}/pickup`, drivers[0].token, { code: winner.rideOtpCode === '0000' ? '0001' : '0000' })).status === 401);
  check('Patient-confirmed pickup', (await request(`/api/v1/bookings/${winner.id}/pickup`, drivers[0].token, { code: winner.rideOtpCode })).status === 200);
  check('Drop change after pickup rejected', (await request(`/api/v1/bookings/${winner.id}/set-drop`, drivers[0].token, { dropLat: 28.6, dropLng: 79.6, dropAddress: 'Wrong late destination' })).status === 404);
  const hospital = jwt({ sub: hospitals[0].id, role: 'hospital', hospitalId: hospitals[0].id });
  const unrelated = jwt({ sub: other.id, role: 'hospital', hospitalId: other.id });
  check('Destination hospital can read booking', (await request(`/api/v1/bookings/${winner.id}`, hospital)).status === 200);
  check('Other hospital cannot read booking', (await request(`/api/v1/bookings/${winner.id}`, unrelated)).status === 403);
  check('Other hospital cannot read ETA', (await request(`/api/v1/bookings/${winner.id}/live-eta`, unrelated)).status === 403);
  check('Scoped hospital receipt', (await request(`/api/v1/hospital/bookings/${winner.id}/receipt`, hospital)).status === 200);
  check('Cross-hospital receipt rejected', (await request(`/api/v1/hospital/bookings/${winner.id}/receipt`, unrelated)).status === 404);
  check('Complete transition', (await request(`/api/v1/bookings/${winner.id}/complete`, drivers[0].token, {})).status === 200);
  check('Cannot regress completed ride to arrived', (await request(`/api/v1/bookings/${winner.id}/arrived`, drivers[0].token, {})).status === 409);
  check('Repeated complete rejected', (await request(`/api/v1/bookings/${winner.id}/complete`, drivers[0].token, {})).status === 409);
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => request('/api/v1/bookings', users[2].token, input)));
  check('Concurrent create leaves one active user booking', concurrent.filter(r => r.status === 201).length === 1 && concurrent.every(r => [201, 409, 429].includes(r.status)), concurrent);
  const sos = await request('/api/v1/bookings', users[3].token, { ...input, emergencyType: 'CARDIAC', isSos: true });
  check('SOS created while no driver available', sos.status === 201, sos);
  const online = await request('/api/v1/driver/availability', drivers[2].token, { status: 'AVAILABLE', lat: input.pickupLat, lng: input.pickupLng });
  let queue;
  for (let attempt = 0; attempt < 20; attempt++) {
    queue = await request('/api/v1/driver/incoming', drivers[2].token);
    if (queue.body.requests.some(r => r.id === sos.body.booking.id)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  check('Coming online recovers eligible pending SOS', online.status === 200 && queue.body.requests.some(r => r.id === sos.body.booking.id && r.is_sos), { online, queue });
  check('Incoming carries automated landmark field', queue.body.requests.every(r => 'pickup_landmark' in r));
  if (process.env.TEST_IDENTITIES_FILE) fs.writeFileSync(process.env.TEST_IDENTITIES_FILE, JSON.stringify({ users, drivers, bookingIds: [b1.id,b2.id,sos.body.booking.id] }), { mode: 0o600 });
  if (process.env.TEST_RESULTS_FILE) fs.writeFileSync(process.env.TEST_RESULTS_FILE, JSON.stringify(results, null, 2));
  console.log(`${results.length} checks passed in isolated PostgreSQL.`);
}
main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => sql.end());
