const assert = require('assert/strict');
const base = process.env.TEST_API_BASE || 'http://127.0.0.1:4100';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local isolated API required');
const headers = { 'x-admin-key': process.env.ADMIN_API_KEY };
async function page(params) {
  const res = await fetch(base + '/api/v1/admin/drivers?' + new URLSearchParams(params), { headers });
  assert.equal(res.status, 200); return res.json();
}
(async () => {
  let cursor = '', total, example, summary;
  const seen = new Set();
  do {
    const data = await page({ limit: 17, ...(cursor ? { cursor } : {}) });
    total = data.total; summary = data.summary;
    for (const driver of data.drivers) {
      assert.ok(!seen.has(driver.id), 'Each driver appears once');
      seen.add(driver.id); example = driver;
    }
    cursor = data.nextCursor || '';
  } while (cursor);
  assert.ok(total > 17, 'Multi-page fixtures required');
  assert.equal(seen.size, total); assert.equal(summary.total, total);
  const found = await page({ q: example.phone });
  assert.ok(found.drivers.some(d => d.id === example.id), 'Oldest driver remains searchable');
  const available = await page({ status: 'AVAILABLE' });
  assert.ok(available.drivers.every(d => d.status === 'AVAILABLE'));
  for (const params of [{ cursor: 'invalid' }, { limit: 501 }, { status: 'invalid' }]) {
    const res = await fetch(base + '/api/v1/admin/drivers?' + new URLSearchParams(params), { headers });
    assert.equal(res.status, 400);
  }
  console.log(JSON.stringify({ pass: true, drivers: seen.size, checks: ['complete stable pagination', 'oldest driver search', 'server status filter', 'range summary', 'invalid query rejection'] }));
})().catch(error => { console.error(error); process.exitCode = 1; });
