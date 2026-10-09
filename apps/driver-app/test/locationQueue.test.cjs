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
  vm.runInNewContext(source, { module, exports: module.exports, console: { error() {} }, require(name) {
    if (name === '@react-native-async-storage/async-storage') return { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); } };
    if (name === './api') return { getCachedProfile: async () => ({ id: owner }), api: send };
    throw Error('Unexpected dependency ' + name);
  } });
  return module.exports;
}
const ack = async (_, request) => ({ ok: true, accepted: request.body.points.length, expired: 0 });
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
  await assert.rejects(other.flushLocationQueue(), /does not belong/);
  assert.equal(sent, false);
});
