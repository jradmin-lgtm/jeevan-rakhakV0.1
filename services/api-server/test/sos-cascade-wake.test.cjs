const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/sos-cascade.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function runtime({ isSos = true, attempts = [] } = {}) {
  let now = 1_000_000, available = false, eligibilityGate = null, eligibilityReads = 0;
  const booking = { id: 'booking', status: 'REQUESTED', driverId: null, userId: 'user', pickupLat: 28, pickupLng: 79, dispatchStartedAt: new Date(now), isSos };
  const timers = [], emissions = [], pushes = [], errors = [];
  const tables = Object.fromEntries(['bookings', 'drivers', 'driverHeartbeats', 'sosDispatchAttempts'].map(name => [name, new Proxy({ tableName: name }, { get: (target, key) => key in target ? target[key] : key })]));
  function query() {
    let table;
    const q = { from(t) { table = t; return q; }, where() { return q; }, limit() { return q; }, for() { return q; }, leftJoin() { return q; }, async then(resolve, reject) {
      try {
        let rows;
        if (table === tables.bookings) rows = [booking];
        else if (table === tables.sosDispatchAttempts) rows = attempts;
        else if (table === tables.drivers) {
          eligibilityReads++;
          if (eligibilityGate) await eligibilityGate;
          rows = available ? [{ driverId: 'driver', lastLat: 28, lastLng: 79, lastSeenAt: new Date(now) }] : [];
        } else throw new Error('unexpected table');
        resolve(rows);
      } catch (error) { reject(error); }
    } };
    return q;
  }
  const db = { select: query, async transaction(fn) { return fn(db); }, insert() { return { values(row) { return { async onConflictDoUpdate() { attempts.push({ ...row, pushedAt: new Date(now), rejectedAt: null }); } }; } }; } };
  const mod = { exports: {} };
  const app = { log: { error(...args) { errors.push(args); } } };
  vm.runInNewContext(source, { exports: mod.exports, module: mod, console, process: { env: {} }, Date: class extends Date { static now() { return now; } }, setTimeout(fn, ms) { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; }, clearTimeout(timer) { timer.cleared = true; }, AbortSignal, require(name) {
    if (name === '@jr/db') return { db, ...tables };
    if (name === 'drizzle-orm') return { and() {}, eq() {}, gte() {}, isNotNull() {}, sql() {} };
    if (name === '@jr/config') return { config: { socketBaseUrl: 'http://local', internalApiSecret: 'test', googleDispatchRankingEnabled: false } };
    if (name === '@jr/utils') return { haversineDistanceKm: () => 0 };
    if (name === './google-maps') return { getRoadDistances: async () => null };
    if (name === './events') return { emitEvent: async () => {} };
    if (name === './push') return { pushToDriver: async (...args) => pushes.push(args), dismissPushToDriver: async () => {} };
    if (name === './realtime-http') return { realtimeRequest: async (url, options) => emissions.push(JSON.parse(options.body)) };
    throw new Error(name);
  } });
  return { ...mod.exports, app, timers, attempts, emissions, pushes, errors, booking, setAvailable(v = true) { available = v; }, advance(ms) { now += ms; }, gate(promise) { eligibilityGate = promise; }, reads() { return eligibilityReads; } };
}
const turns = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
test('online wakes an empty SOS first wave immediately and cancels its20s timer', async () => {
  const r = runtime(); await r.startCascade(r.app, 'booking'); assert.equal(r.attempts.length, 0); assert.equal(r.timers[0].ms, 20000);
  r.setAvailable(); await r.offerPendingSosToDriver(r.app, 'driver');
  assert.equal(r.attempts.length, 1); assert.equal(r.attempts[0].waveNumber, 1); assert.equal(r.timers[0].cleared, true); assert.equal(r.pushes.length, 1);
  assert.equal(r.timers.filter(t => !t.cleared && !t.fired).length, 1);
  r.timers[0].fn(); await turns(); assert.equal(r.attempts.length, 1, 'cancelled callback cannot run a stale wave'); assert.equal(r.timers.length, 2);
});
test('online preserves active-offer20s deadline and persisted cycle on boot', async () => {
  const r = runtime({ attempts: [{ driverId: 'existing-driver', pushedAt: new Date(1_000_000), waveNumber: 1 }] }); r.setAvailable(); await r.startCascade(r.app, 'booking');
  await r.offerPendingSosToDriver(r.app, 'driver'); assert.equal(r.attempts.length, 1); assert.equal(r.pushes.length, 0); assert.equal(r.timers.length, 1); assert.equal(r.timers[0].ms, 20000);
  r.advance(20000); r.timers[0].fired = true; r.timers[0].fn(); await turns(); assert.equal(r.attempts.length, 2); assert.equal(r.pushes.length, 1);
});
test('concurrent online notifications coalesce into one offer and one live timer', async () => {
  const r = runtime(); await r.startCascade(r.app, 'booking'); r.setAvailable();
  await Promise.all(Array.from({ length: 12 }, () => r.offerPendingSosToDriver(r.app, 'driver')));
  assert.equal(r.attempts.length, 1); assert.equal(r.pushes.length, 1); assert.equal(r.timers.filter(t => !t.cleared && !t.fired).length, 1);
});
test('availability while timer eligibility is in flight does not overlap or duplicate ticks', async () => {
  const r = runtime(); await r.startCascade(r.app, 'booking'); let release; r.gate(new Promise(resolve => { release = resolve; })); r.advance(20000); r.timers[0].fired = true; r.timers[0].fn(); await turns();
  const before = r.reads(); r.setAvailable(); const wake = r.offerPendingSosToDriver(r.app, 'driver'); await turns(); assert.equal(r.reads(), before);
  release(); await wake; await turns(); assert.equal(r.attempts.length, 1); assert.equal(r.pushes.length, 1); assert.equal(r.timers.filter(t => !t.cleared && !t.fired).length, 1);
});
test('stop cancels empty wait and late callback cannot restart it', async () => {
  const r = runtime(); await r.startCascade(r.app, 'booking'); r.stopCascade('booking'); r.timers[0].fn(); await turns();
  assert.equal(r.timers[0].cleared, true); assert.equal(r.attempts.length, 0); assert.equal(r.reads(), 1); assert.equal(r.timers.length, 1);
});
test('normal empty wait and rejected current-cycle SOS do not get an early wave', async () => {
  for (const options of [{ isSos: false }, { attempts: [{ driverId: 'rejected', pushedAt: new Date(1_000_000), rejectedAt: new Date(1_000_000), waveNumber: 1 }] }]) {
    const r = runtime(options); await r.startCascade(r.app, 'booking'); r.setAvailable(); await r.offerPendingSosToDriver(r.app, 'driver'); assert.equal(r.pushes.length, 0); assert.equal(r.timers.length, 1);
  }
});

test('transient availability wake failure fails loud and retains exactly one retry', async () => {
  const r = runtime(); await r.startCascade(r.app, 'booking'); r.setAvailable();
  r.gate({ then(_resolve, reject) { reject(new Error('synthetic eligibility failure')); } });
  await assert.rejects(r.offerPendingSosToDriver(r.app, 'driver'), /synthetic eligibility failure/);
  assert.equal(r.errors.length, 1); assert.equal(r.timers.filter(t => !t.cleared && !t.fired).length, 1); assert.equal(r.attempts.length, 0);
  r.gate(null); r.advance(20000); const retry = r.timers.at(-1); retry.fired = true; retry.fn(); await turns();
  assert.equal(r.attempts.length, 1); assert.equal(r.pushes.length, 1); assert.equal(r.timers.filter(t => !t.cleared && !t.fired).length, 1);
});
