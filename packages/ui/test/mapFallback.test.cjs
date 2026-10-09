const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const out = {};
  new Function('exports', 'require', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(out, name => load(path.resolve(path.dirname(file), name + '.ts')));
  return out;
}
const { buildEmbedHtml } = load(path.resolve(__dirname, '../src/maps/embedHtml.ts'));
const { buildPickerHtml } = load(path.resolve(__dirname, '../src/maps/pickerHtml.ts'));
const config = { provider: 'google', googleBrowserKey: 'test-key', tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', tileAttribution: 'OpenStreetMap' };
const initial = { pLat: 28.48, pLng: 79.44, pLabel: 'Pickup', dLat: 28.47, dLng: 79.43, dLabel: 'Driver', drLat: null, drLng: null, drLabel: 'Hospital', routePath: [[28.47,79.43],[28.48,79.44]] };
function contextFor(html) {
  const messages = [], timers = [], el = { innerHTML: '' };
  const context = vm.createContext({ console, setTimeout: (fn, ms) => timers.push({fn,ms}), clearTimeout() {}, document: { getElementById: () => el, querySelector: () => ({}) }, window: { addEventListener() {}, ReactNativeWebView: { postMessage: text => messages.push(JSON.parse(text)) } } });
  vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  return { context, messages, timers };
}
test('script-download failure selects backup map and clears incompatible route data', () => {
  const html = buildEmbedHtml(initial, config), { context } = contextFor(html);
  let boots = 0;
  context.window.jrPending = { routePath: initial.routePath };
  context.window.__jrBootLeaflet = init => { boots++; assert.equal(init.routePath, null); };
  vm.runInContext(html.match(/onerror="([^"]+)"/)[1], context);
  assert.equal(boots, 1);
  assert.equal(context.window.jrPending.routePath, null);
});
test('a Google wrapper without loaded tiles does not satisfy the map watchdog', () => {
  const { context, timers } = contextFor(buildEmbedHtml(initial, config));
  context.document.querySelector = () => null;
  let boots = 0; context.window.__jrBootLeaflet = () => boots++;
  timers.find(t => t.ms === 12000).fn();
  assert.equal(boots, 1);
});
test('late Google startup cannot overwrite an active backup renderer', () => {
  const { context } = contextFor(buildEmbedHtml(initial, config));
  context.window.__jrLeafletBooted = true;
  context.window.__jrMapProvider = 'osm';
  vm.runInContext('window.__jrBootGoogle(INIT)', context);
  assert.equal(context.window.__jrMapProvider, 'osm');
});
test('readiness bridge reports the actual provider', () => {
  const { context, messages } = contextFor(buildEmbedHtml(initial, config));
  context.window.__jrMapProvider = 'osm';
  vm.runInContext('jrReady()', context);
  assert.equal(messages.at(-1).provider, 'osm');
});
test('picker script failure uses the same idempotent fallback entry point', () => {
  const html = buildPickerHtml({lat:28.48,lng:79.44}, 15, config), { context, timers } = contextFor(html);
  let boots=0; context.window.__jrBootLeafletPicker=()=>{boots++;context.window.__jrMapProvider='osm';context.window.jrMap={};};
  vm.runInContext(html.match(/onerror="([^"]+)"/)[1], context);
  vm.runInContext('jrPickerFallback()', context);
  assert.equal(boots,1);
  assert.ok(timers.some(t=>t.ms===12000));
});
