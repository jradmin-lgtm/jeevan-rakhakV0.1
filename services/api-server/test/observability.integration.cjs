const fs = require('fs');
const assert = require('assert/strict');
const env = process.env;
if (!env.DATABASE_URL || !['localhost', '127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname)) throw Error('Isolated local database required');
const base = env.TEST_API_BASE || 'http://127.0.0.1:4100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Isolated local API required');
const sql = require('../../../packages/db/node_modules/postgres')(env.DATABASE_URL);
const headers = { 'x-admin-key': env.ADMIN_API_KEY, 'content-type': 'application/json' };
const results = [];
async function request(path, options = {}) {
  return fetch(base + path, { ...options, headers, signal: AbortSignal.timeout(10000) });
}
async function main() {
  assert.equal((await request('/api/v1/admin/health')).status, 200);
  await sql`ALTER TABLE system_events RENAME TO system_events_release_probe`;
  try {
    const health = await request('/api/v1/admin/health');
    assert.equal(health.status, 503);
    assert.equal((await health.json()).error, 'event_counts_unavailable');
    const report = await request('/api/v1/admin/events/report', { method: 'POST', body: JSON.stringify({ level: 'info', source: 'release-test', message: 'Persistence failure test' }) });
    assert.equal(report.status, 503);
    assert.equal((await report.json()).error, 'event_write_failed');
    results.push({ name: 'Missing event storage cannot produce healthy counts or false persistence success', pass: true });
  } finally {
    await sql`ALTER TABLE system_events_release_probe RENAME TO system_events`;
  }
  await sql`ALTER TABLE api_usage RENAME TO api_usage_release_probe`;
  try {
    const health = await request('/api/v1/admin/health');
    assert.equal(health.status, 503);
    assert.equal((await health.json()).error, 'map_usage_unavailable');
    results.push({ name: 'Missing map usage storage is reported as unavailable', pass: true });
  } finally {
    await sql`ALTER TABLE api_usage_release_probe RENAME TO api_usage`;
  }
  assert.equal((await request('/api/v1/admin/health')).status, 200);
  const message = 'Persistence recovery test ' + Date.now();
  const report = await request('/api/v1/admin/events/report', { method: 'POST', body: JSON.stringify({ level: 'info', source: 'release-test', message }) });
  assert.equal(report.status, 200);
  const [saved] = await sql`SELECT id FROM system_events WHERE message=${message}`;
  assert.ok(saved?.id);
  results.push({ name: 'Health and event persistence recover after storage restoration', pass: true });
  for (const result of results) console.log('PASS', result.name);
  if (env.TEST_RESULTS_FILE) fs.writeFileSync(env.TEST_RESULTS_FILE, JSON.stringify(results, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => sql.end());
