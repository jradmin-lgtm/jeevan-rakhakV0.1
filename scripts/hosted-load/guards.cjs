const assert = require('node:assert/strict');
function publicHostname(host) {
  assert.match(host, /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i, 'Public DNS hostname required, not an IP or local alias');
  assert.ok(!/\.(local|internal|localhost)$/i.test(host), 'Public hosted hostname required');
}
function publicOrigin(value) {
  const u = new URL(value);
  assert.equal(u.protocol, 'https:', 'Hosted services must use HTTPS');
  assert.equal(value, u.origin, 'Use an origin without credentials, path, query or fragment');
  publicHostname(u.hostname);
  return u.origin;
}
function validateConfig(c) {
  if(c.scenario!==undefined){assert.ok(['STRICT_BASELINE','PRODUCTION_CLIENT_RESILIENCE'].includes(c.scenario),'Explicit known scenario required');if(c.scenario==='PRODUCTION_CLIENT_RESILIENCE')require('./client-workload.cjs').validateClientScenario(c);}
  assert.match(c.environmentId, /^jr-load-[a-z0-9-]{6,60}$/);
  assert.match(c.databaseName, /^jr_load_[a-z0-9_]{6,60}$/);
  publicOrigin(c.apiOrigin); publicOrigin(c.socketOrigin);
  assert.notEqual(c.apiOrigin, c.socketOrigin, 'Separate API and realtime service origins required');
  assert.match(c.expectedBuild, /^[a-f0-9]{40}$/);
  if(c.expectedSocketBuild!==undefined)assert.match(c.expectedSocketBuild,/^[a-f0-9]{40}$/,'Explicit socket build must be a full SHA');
  assert.ok([10,50].includes(c.rides), 'Explicit 10 or 50 ride scope required');
  assert.ok(Number.isInteger(c.cycles) && c.cycles >= 12 && c.cycles <= 360, '12 to 360 five-second cycles');
  assert.equal(typeof c.mapsEnabled, 'boolean');
  assert.equal(c.maxMapHttpCalls, c.mapsEnabled ? c.rides*2 : 0);
  for (const k of ['httpP95Ms', 'gpsP95Ms', 'deliveryTimeoutMs']) assert.ok(Number.isFinite(c[k]) && c[k] >= 100 && c[k] <= 60000, 'Bounded latency thresholds required');
  assert.equal(c.isolatedHostingConfirmed, true);
  assert.equal(c.outboundNotificationsDisabled, true);
  assert.equal(c.providerQuotaBudgetConfirmed, c.mapsEnabled);
  return c;
}
function validateRuntime(c, e) {
  validateConfig(c);
  assert.equal(e.JR_HOSTED_LOAD_CONFIRM, c.environmentId, 'Explicit environment confirmation required');
  assert.ok(e.JR_HOSTED_LOAD_JWT_SECRET?.length >= 32, 'Dedicated test JWT secret required');
  const db = new URL(e.JR_HOSTED_LOAD_DATABASE_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(db.protocol));
  assert.equal(decodeURIComponent(db.pathname.slice(1)), c.databaseName, 'Database name mismatch');
  publicHostname(db.hostname);
  assert.equal(db.searchParams.get('sslmode'), 'require', 'Hosted DB must require TLS');
}
function percentile(xs, p) { return xs.length ? Math.round([...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1]*10)/10 : null; }
function validateAck(data, points) {
  const key = p => `${p.bookingId}:${p.ts}`;
  const expected = new Set(points.map(key));
  assert.equal(data.ok, true);
  assert.equal(data.expired, 0);
  assert.ok(Array.isArray(data.acknowledged) && Array.isArray(data.rejected));
  const accepted = data.acknowledged.map(key), rejected = data.rejected.map(key);
  assert.equal(data.accepted, accepted.length);
  assert.equal(new Set([...accepted,...rejected]).size, accepted.length+rejected.length, 'Duplicate/overlapping ACK');
  assert.equal(accepted.length+rejected.length, expected.size);
  assert.ok([...accepted,...rejected].every(k=>expected.has(k)), 'Unknown ACK');
  return {accepted, rejected};
}
function expectedBuildForOrigin(c,origin){
 if(origin===c.apiOrigin)return c.expectedBuild;
 if(origin===c.socketOrigin)return c.expectedSocketBuild??c.expectedBuild;
 throw new Error('Unknown target origin cannot be assigned a build');
}
module.exports = {validateConfig, validateRuntime, percentile, validateAck, expectedBuildForOrigin};
