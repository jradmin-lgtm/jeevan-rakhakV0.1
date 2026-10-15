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
test('late fallback restores current ride position and hospital instead of mount snapshot', () => {
  const { context } = contextFor(buildEmbedHtml(initial, config));
  context.window.__jrLatest = {
    pickup: { lat: 28.51, lng: 79.45, label: 'Pickup' },
    driver: { lat: 28.52, lng: 79.46, label: 'Ambulance' },
    drop: { lat: 28.55, lng: 79.49, label: 'Hospital' }, routePath: [[28.52,79.46],[28.55,79.49]]
  };
  let recovered;
  context.window.__jrBootLeaflet = init => { recovered = init; };
  vm.runInContext('jrForceFallback()', context);
  assert.equal(recovered.dLat, 28.52);
  assert.equal(recovered.drLat, 28.55);
  assert.equal(recovered.pLat, 28.51);
  assert.equal(recovered.routePath, null, 'Google route is not copied to OSM');
});
test('recovering one ride cannot mutate a separate ride renderer', () => {
  const a = contextFor(buildEmbedHtml(initial, config));
  const b = contextFor(buildEmbedHtml({...initial, pLat: 29.0}, config));
  a.context.window.__jrBootLeaflet = () => { a.context.window.__jrMapProvider = 'osm'; };
  b.context.window.__jrMapProvider = 'google';
  vm.runInContext('jrForceFallback()', a.context);
  assert.equal(b.context.window.__jrMapProvider, 'google');
  assert.equal(b.context.INIT.pLat, 29.0);
});
test('connectivity restoration notifies the native recovery controller', () => {
  const listeners = new Map();
  const {context, messages} = contextFor(buildEmbedHtml(initial, config));
  context.window.addEventListener = (event, handler) => listeners.set(event, handler);
  vm.runInContext(buildEmbedHtml(initial, config).match(/<script>\s*([\s\S]*?)<\/script>/)[1], context);
  listeners.get('offline')(); listeners.get('online')();
  assert.deepEqual(messages.slice(-2).map(m => m.type), ['jr:map:tiles-unavailable','jr:map:online']);
});
function leafletHarness(init = initial) {
  const {context} = contextFor(buildEmbedHtml({...init,routePath:null},config));
  const attached=new Set(),markers=[],fits=[];
  const container={clientWidth:400,clientHeight:320,addEventListener(){}};
  const map={setView(point){this.initialView=point;return this;},on(){},getContainer:()=>container,fitBounds:bounds=>fits.push(bounds),invalidateSize(){},removeLayer(layer){attached.delete(layer);return this;}};
  function layer(coords,options,marker){let position=coords;const value={options,marker,addTo(){attached.add(this);return this;},getLatLng(){return {lat:position[0],lng:position[1]};},setLatLng(point){position=point;return this;},setIcon(icon){this.options.icon=icon;return this;},setLatLngs(points){position=points;return this;},setOpacity(){throw Error('Transparent markers remain accessible');}};if(marker)markers.push(value);return value;}
  const L={map:()=>map,divIcon:icon=>icon,marker:(point,options)=>layer(point,options,true),polyline:(points,options)=>layer(points,options,false),tileLayer:()=>({on(){return this;},addTo(){return this;}}),featureGroup:points=>({getBounds:()=>({pad:()=>points})})};
  context.L=L;context.window.L=L;context.window.matchMedia=()=>({matches:true});context.requestAnimationFrame=fn=>fn(0);
  context.window.__jrBootLeaflet({...init,routePath:null});
  return {context,attached,markers,map,fits,pickup:markers.find(m=>m.options.icon.html.includes('label pickup'))};
}
test('initially hidden pickup is absent from Leaflet layers, not a transparent accessible marker',()=>{
 const h=leafletHarness({...initial,showPickup:false,drLat:28.49,drLng:79.45});
 assert.ok(!h.attached.has(h.pickup));assert.equal(h.markers.filter(m=>h.attached.has(m)).length,2);
 assert.ok(h.fits.every(points=>!points.includes(h.pickup)));assert.deepEqual(Array.from(h.map.initialView),[initial.pLat,initial.pLng]);
});
test('pickup visibility removes and restores the same updated marker without stale route or duplicate layer',()=>{
 const h=leafletHarness();assert.ok(h.attached.has(h.pickup));
 const payload={showPickup:false,pickup:{lat:28.6,lng:79.5,label:'Updated pickup'},driver:{lat:initial.dLat,lng:initial.dLng,label:'Ambulance'},drop:null,routePath:null};
 h.context.window.jrMap.update(payload);h.context.window.jrMap.update(payload);
 assert.ok(!h.attached.has(h.pickup));assert.equal([...h.attached].filter(layer=>layer.options.className==='jr-route').length,0);
 h.context.window.jrMap.update({...payload,showPickup:true});
 assert.ok(h.attached.has(h.pickup));assert.equal(h.markers.filter(m=>m===h.pickup).length,1);assert.ok(h.pickup.options.icon.html.includes('Updated pickup'));assert.equal(h.pickup.getLatLng().lat,28.6);
});

test('Leaflet stationary pickup transition updates existing driver and drop labels without recreating map',()=>{
 const h=leafletHarness({...initial,drLat:28.49,drLng:79.45});
 const driver=h.markers.find(m=>m.options.icon.html.includes('label driver'));
 const drop=h.markers.find(m=>m.options.icon.html.includes('label drop'));
 h.context.window.jrMap.update({showPickup:false,pickup:{lat:initial.pLat,lng:initial.pLng,label:'Pickup'},driver:{lat:initial.dLat,lng:initial.dLng,label:'Ambulance · patient on board'},drop:{lat:28.49,lng:79.45,label:'अस्पताल'},routePath:null});
 assert.ok(driver.options.icon.html.includes('Ambulance · patient on board'));assert.ok(drop.options.icon.html.includes('अस्पताल'));
 assert.equal(h.markers.length,3);assert.ok(h.attached.has(driver));assert.ok(!h.attached.has(h.pickup));
});
function googleHarness(init=initial){
 const {context}=contextFor(buildEmbedHtml({...init,routePath:null},config));
 const markers=[],lines=[],container={addEventListener(){}};
 context.document.createElement=()=>({style:{},innerHTML:''});
 function OverlayView(){}
 OverlayView.prototype.setMap=function(map){this.attached=!!map;if(map){if(!markers.includes(this))markers.push(this);this.onAdd();this.draw();}else this.onRemove();};
 OverlayView.prototype.getPanes=()=>({floatPane:{appendChild(div){div.parentNode={removeChild(){}};}}});
 OverlayView.prototype.getProjection=()=>({fromLatLngToDivPixel:()=>({x:0,y:0})});
 function Map(){this.addListener=()=>{};this.getDiv=()=>container;this.fitBounds=()=>{};this.setCenter=()=>{};this.setZoom=()=>{};}
 function LatLng(lat,lng){this.lat=()=>lat;this.lng=()=>lng;}
 function LatLngBounds(){this.extend=()=>{};}
 function Polyline(options){this.options=options;this.path=options.path;this.map=options.map;this.setMap=map=>{this.map=map;};this.setPath=path=>{this.path=path;};this.getPath=()=>this.path;lines.push(this);}
 context.google={maps:{Map,OverlayView,LatLng,LatLngBounds,Polyline,event:{addListener(){},addListenerOnce(map,name,fn){fn();}}}};
 context.window.matchMedia=()=>({matches:true});
 context.window.__jrBootGoogle({...init,routePath:null});
 return {context,markers,lines};
}
test('Google stationary pickup transition updates visible labels and removes stale pickup route in place',()=>{
 const h=googleHarness({...initial,drLat:28.49,drLng:79.45});
 const driver=h.markers.find(m=>m.html.includes('label driver'));
 const drop=h.markers.find(m=>m.html.includes('label drop'));
 const pickup=h.markers.find(m=>m.html.includes('label pickup'));
 h.context.window.jrMap.update({showPickup:false,pickup:{lat:initial.pLat,lng:initial.pLng,label:'Pickup'},driver:{lat:initial.dLat,lng:initial.dLng,label:'Ambulance · patient on board'},drop:{lat:28.49,lng:79.45,label:'अस्पताल'},routePath:null});
 assert.ok(driver.div.innerHTML.includes('Ambulance · patient on board'));assert.ok(drop.div.innerHTML.includes('अस्पताल'));
 assert.equal(h.markers.length,3);assert.ok(driver.attached);assert.ok(!pickup.attached);
 assert.ok(h.lines.filter(line=>line.options.strokeColor==='#1E5EFF').every(line=>!line.map));
});
