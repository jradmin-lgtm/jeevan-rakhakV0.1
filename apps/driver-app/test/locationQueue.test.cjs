const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/locationQueue.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const point = i => ({ bookingId: 'ride-one', lat: 28.48 + i / 10000, lng: 79.44, ts: 1000 + i });
function runtime(storage, send, owner = 'driver-one') {
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, Error, console: { error() {} }, require(name) {
    if (name === '@react-native-async-storage/async-storage') return { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); }, removeItem: async key => { storage.delete(key); } };
    if (name === './api') return { getCachedProfile: async () => ({ id: owner }), api: send };
    throw Error('Unexpected dependency ' + name);
  } });
  return module.exports;
}
const ack = async (_, request) => ({ ok: true, accepted: request.body.points.length, expired: 0 });
test('partial acknowledgement syncs good fixes from the same ride and retains rejected fixes', async () => {
  const storage = new Map();
  let requests = 0;
  const queue = runtime(storage, async (_, request) => {
    requests++;
    assert.equal(request.body.partial, true);
    const rejected = request.body.points.filter(p => p.ts === 1002).map(p => ({ bookingId: p.bookingId, ts: p.ts, reason: 'future_location_fix' }));
    const acknowledged = request.body.points.filter(p => p.ts !== 1002).map(p => ({ bookingId: p.bookingId, ts: p.ts }));
    return { ok: true, accepted: acknowledged.length, expired: 0, acknowledged, rejected };
  });
  for (const i of [1,2,3]) await queue.queueLocation(point(i));
  await assert.rejects(queue.flushLocationQueue(), /future_location_fix/);
  assert.equal(requests, 1);
  assert.equal((await queue.locationQueueStatus()).pending, 1);
  const saved = JSON.parse(storage.get('jr.driver.location-queue.driver-one'));
  assert.deepEqual(saved.points.map(p => p.ts), [1002]);
});
test('partial acknowledgement cannot remove a point the server did not explicitly accept', async () => {
  const storage = new Map();
  const queue = runtime(storage, async () => ({ ok: true, accepted: 1, expired: 0, acknowledged: [{ bookingId:'another-ride', ts:1001 }], rejected: [] }));
  await queue.queueLocation(point(1));
  await assert.rejects(queue.flushLocationQueue(), /acknowledge/);
  assert.equal((await queue.locationQueueStatus()).pending, 1);
});
test('signal loss retains fixes and a new process syncs them with original timestamps', async () => {
  const storage = new Map();
  const offline = runtime(storage, async () => { throw Error('Network unavailable'); });
  await offline.queueLocation(point(1)); await offline.queueLocation(point(2));
  await assert.rejects(offline.flushLocationQueue(), /Network unavailable/);
  assert.equal((await offline.locationQueueStatus()).pending, 2);
  const sent = [];
  const restarted = runtime(storage, async (_, req) => { sent.push(...req.body.points); return ack(_, req); });
  await restarted.flushLocationQueue();
  assert.deepEqual(sent.map(p => p.ts), [1001, 1002]);
  assert.equal((await restarted.locationQueueStatus()).pending, 0);
});
test('repeated flush calls share one upload while a new GPS fix arrives', async () => {
  const storage = new Map(); let release; let requests = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const queue = runtime(storage, async (_, req) => { requests += 1; if (requests === 1) await pending; return ack(_, req); });
  await queue.queueLocation(point(1));
  const first = queue.flushLocationQueue();
  assert.equal(first, queue.flushLocationQueue());
  await queue.queueLocation(point(2)); release(); await first;
  assert.equal((await queue.locationQueueStatus()).pending, 0);
  assert.ok(requests >= 1 && requests <= 2);
});
test('duplicate captures stored once and unacknowledged uploads are retained', async () => {
  const storage = new Map(); const queue = runtime(storage, async () => ({ ok: false }));
  await Promise.all([queue.queueLocation(point(1)), queue.queueLocation(point(1))]);
  assert.equal((await queue.locationQueueStatus()).pending, 1);
  await assert.rejects(queue.flushLocationQueue(), /acknowledge/);
  assert.equal((await queue.locationQueueStatus()).pending, 1);
});
test('driver changes cannot upload the previous driver history', async () => {
  const storage = new Map(); const previous = runtime(storage, ack);
  await previous.queueLocation(point(1)); let sent = false;
  const other = runtime(storage, async () => { sent = true; return { ok: true }; }, 'driver-two');
  await other.flushLocationQueue();
  assert.equal((await previous.locationQueueStatus()).pending, 1);
  assert.equal(sent, false);
});

test('a permanently rejected ride cannot block the next valid ride and remains saved', async () => {
  const storage = new Map();
  const queue = runtime(storage, async (url, request) => {
    if (request.body.points[0].bookingId === 'released') { const error = Error('not_assigned_to_booking'); error.status = 403; throw error; }
    return ack(url, request);
  });
  await queue.queueLocation({ ...point(1), bookingId: 'released' });
  await queue.queueLocation(point(2));
  await assert.rejects(queue.flushLocationQueue(), /not_assigned/);
  assert.equal((await queue.locationQueueStatus()).pending, 1);
});
test('legacy data migrates only for its owner without losing points', async () => {
  const storage = new Map([['jr.driver.location-queue', JSON.stringify({ owner: 'driver-one', points: [point(1)] })]]);
  const other = runtime(storage, ack, 'driver-two');
  await other.flushLocationQueue();
  assert.ok(storage.has('jr.driver.location-queue'));
  const owner = runtime(storage, ack);
  assert.equal((await owner.locationQueueStatus()).pending, 1);
  assert.equal(storage.has('jr.driver.location-queue'), false);
  await owner.flushLocationQueue();
  assert.equal((await owner.locationQueueStatus()).pending, 0);
});

for (const shape of [
  { acknowledged: [] }, { rejected: [] },
  { acknowledged: null, rejected: [] }, { acknowledged: [], rejected: null },
  { acknowledged: {}, rejected: [] },
  { acknowledged: [null], rejected: [] },
  { acknowledged: [{ bookingId: 'ride-one', ts: 1001 }], rejected: [{ bookingId:'ride-one', ts:1002 }] }
]) test('malformed partial ACK retains all points: ' + JSON.stringify(shape), async () => {
  const storage = new Map();
  const queue = runtime(storage, async () => ({ ok: true, accepted: 1, expired: 0, ...shape }));
  await queue.queueLocation(point(1));
  await assert.rejects(queue.flushLocationQueue(), /malformed partial/);
  assert.equal((await queue.locationQueueStatus()).pending, 1);
});
test('duplicate partial ACK rows cannot delete stored locations', async () => {
  const storage = new Map();
  const accepted = { bookingId:'ride-one', ts:1001 };
  const queue = runtime(storage, async () => ({ ok:true, accepted:1, expired:0, acknowledged:[accepted, accepted], rejected:[] }));
  await queue.queueLocation(point(1));
  await assert.rejects(queue.flushLocationQueue(), /acknowledge/);
  assert.equal((await queue.locationQueueStatus()).pending, 1);
});
