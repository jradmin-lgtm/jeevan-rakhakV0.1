const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const moduleExports = {};
new Function('exports', ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/maps/tracking.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(moduleExports);
const { newerFix, remainingRoute } = moduleExports;
test('GPS ignores late, stale, future and invalid fixes', () => {
  const now = 1_000_000, current = { lat: 28, lng: 79, ts: now - 1000 };
  for (const next of [{...current, ts:now-2000},{...current,ts:now-120001},{...current,ts:now+10001},{...current,lat:91},{...current,lng:181},{...current,lat:NaN}]) assert.equal(newerFix(current,next,now), current);
  const next={...current,ts:now}; assert.equal(newerFix(current,next,now),next);
});
test('distance and ETA progress along a provider road route', () => {
  const path=[[28,79],[28.01,79],[28.02,79]], estimate={km:2,min:10};
  const values=[28,28.005,28.01,28.015,28.02].map(lat=>remainingRoute(path,{lat,lng:79},estimate));
  assert.deepEqual(values.map(v=>v.min),[10,8,5,2,0]);
  for(let i=1;i<values.length;i++) assert.ok(values[i].km < values[i-1].km);
  assert.ok(Math.abs(values[2].km-1)<0.001);
});
test('off-route GPS retains labelled provider estimate until a refresh', () => {
  const estimate={km:2,min:10};assert.equal(remainingRoute([[28,79],[28.02,79]],{lat:29,lng:80},estimate),estimate);
  assert.equal(remainingRoute(null,{lat:28,lng:79},estimate),estimate);
});
