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
  function layer(coords,options,marker){let position=coords;const value={options,marker,addTo(){attached.add(this);return this;},getLatLng(){return {lat:position[0],lng:position[1]};},setLatLng(point){position=point;return this;},setIcon(icon){this.options.icon=icon;return this;},setLatLngs(points){position=points;return this;},getLatLngs(){return position.map(p=>({lat:p[0],lng:p[1]}));},setOpacity(){throw Error('Transparent markers remain accessible');}};if(marker)markers.push(value);return value;}
  const L={map:()=>map,divIcon:icon=>icon,marker:(point,options)=>layer(point,options,true),polyline:(points,options)=>layer(points,options,false),tileLayer:()=>({on(){return this;},addTo(){return this;}}),featureGroup:points=>({getBounds:()=>({pad:()=>points})}),latLngBounds:points=>({pad:()=>points})};
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
function googleHarness(init=initial,options={}){
 const {context,timers}=contextFor(buildEmbedHtml({...init,routePath:null},config));
 const frames=[],cancelled=new Set(),windowListeners={};let frameId=0;
 const markers=[],lines=[],fits=[],listeners={},container={clientWidth:options.width??400,clientHeight:options.height??320,addEventListener(name,fn){listeners[name]=fn;}};
 context.document.createElement=()=>({style:{},innerHTML:''});
 function OverlayView(){}
 OverlayView.prototype.setMap=function(map){this.attached=!!map;if(map){if(!markers.includes(this))markers.push(this);this.onAdd();this.draw();}else this.onRemove();};
 OverlayView.prototype.getPanes=()=>({floatPane:{appendChild(div){div.parentNode={removeChild(){}};}}});
 OverlayView.prototype.getProjection=()=>({fromLatLngToDivPixel:()=>({x:0,y:0})});
 function Map(){this.addListener=(name,fn)=>{listeners[name]=fn;};this.getDiv=()=>container;this.fitBounds=b=>fits.push(b.points);this.setCenter=()=>{};this.setZoom=()=>{};}
 function LatLng(lat,lng){this.lat=()=>lat;this.lng=()=>lng;}
 function LatLngBounds(){this.points=[];this.extend=p=>this.points.push([p.lat(),p.lng()]);}
 function Polyline(options){this.options=options;this.path=options.path;this.map=options.map;this.setMap=map=>{this.map=map;};this.setPath=path=>{this.path=path;};this.getPath=()=>this.path;lines.push(this);}
 context.google={maps:{Map,OverlayView,LatLng,LatLngBounds,Polyline,event:{addListener(){},addListenerOnce(map,name,fn){fn();}}}};
 context.window.matchMedia=()=>({matches:!options.animate});
 context.performance={now:()=>0};
 context.requestAnimationFrame=fn=>{const id=++frameId;if(options.deferred)frames.push({id,fn});else fn(0);return id;};
 context.cancelAnimationFrame=id=>cancelled.add(id);
 context.window.addEventListener=(name,fn)=>{windowListeners[name]=fn;};
 if(options.pending)context.window.jrPending=options.pending;
 context.window.__jrBootGoogle({...init,routePath:init.routePath??null});
 function flush(time=0,includeCancelled=false){const pending=frames.splice(0);for(const f of pending)if(includeCancelled||!cancelled.has(f.id))f.fn(time);}
 return {context,markers,lines,fits,listeners,container,windowListeners,timers,frames,flush};
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
const localUpdate={pickup:{lat:28.48327,lng:79.445282,label:'Pickup'},driver:{lat:28.48327,lng:79.4452817,label:'Ambulance'},drop:{lat:28.49,lng:79.45,label:'Hospital'},routeProvider:'google',routePath:[[28.48327,79.4452817],[28.49,79.45]]};
function assertLocalFit(points){assert.ok(points.length>=2);assert.ok(points.every(([lat,lng])=>lat>28.4&&lat<28.6&&lng>79.3&&lng<79.6));}
test('Google corrected geometry replaces stale distant camera bounds without remount',()=>{const h=googleHarness({...initial,dLat:37.422,dLng:-122.084,drLat:28.49,drLng:79.45},{deferred:true});h.flush();assert.ok(h.fits.at(-1).some(p=>p[1]<0));h.context.window.jrMap.update(localUpdate);h.flush();assertLocalFit(h.fits.at(-1));assert.equal(h.markers.length,3);});
test('Google fit waits for measurable layout and retries on container resize',()=>{const h=googleHarness(initial,{deferred:true,width:0,height:0});h.flush();assert.equal(h.fits.length,0);h.container.clientWidth=400;h.container.clientHeight=240;h.windowListeners.resize();h.flush();assert.ok(h.fits.length>0);});
test('late Google boot replays latest pending geometry before deferred camera fit',()=>{const h=googleHarness({...initial,dLat:37.422,dLng:-122.084},{deferred:true,pending:localUpdate});h.flush();assertLocalFit(h.fits.at(-1));assert.equal(h.context.window.jrPending,null);});
test('Google manual pan remains until explicit recenter resnaps latest authoritative positions',()=>{const h=googleHarness({...initial,drLat:28.49,drLng:79.45},{deferred:true,animate:true});h.flush();const before=h.fits.length;h.listeners.dragstart();h.context.window.jrMap.update(localUpdate);h.flush(300);h.windowListeners.resize();h.flush(400);assert.equal(h.fits.length,before);h.context.window.jrMap.recenter();h.flush(500);assertLocalFit(h.fits.at(-1));const driver=h.markers.find(m=>m.html.includes('label driver'));assert.equal(driver.getPos().lat(),localUpdate.driver.lat);assert.equal(driver.getPos().lng(),localUpdate.driver.lng);});
test('Google phase transition frames destination with combined marker and omits old pickup',()=>{const h=googleHarness({...initial,pLat:29,pLng:80,drLat:28.49,drLng:79.45},{deferred:true});h.flush();h.context.window.jrMap.update({...localUpdate,showPickup:false,pickup:{lat:29,lng:80,label:'Old pickup'},driver:{...localUpdate.driver,label:'Ambulance · patient on board'}});h.flush();assertLocalFit(h.fits.at(-1));assert.ok(h.markers.find(m=>m.html.includes('label driver')).html.includes('patient on board'));assert.ok(!h.markers.find(m=>m.html.includes('label pickup')).attached);});
test('Google overlapping marker animations cannot overwrite latest target after recenter',()=>{const h=googleHarness(initial,{deferred:true,animate:true});h.flush();h.context.window.jrMap.update({...localUpdate,driver:{lat:28.5,lng:79.5}});h.flush(300);h.context.window.jrMap.update(localUpdate);h.context.window.jrMap.recenter();h.flush(1800,true);h.flush(2500,true);const d=h.markers.find(m=>m.html.includes('label driver'));assert.equal(d.getPos().lat(),localUpdate.driver.lat);assert.equal(d.getPos().lng(),localUpdate.driver.lng);assertLocalFit(h.fits.at(-1));});
test('Google camera requests coalesce and tiny stationary changes do not repeatedly zoom',()=>{const h=googleHarness(initial,{deferred:true});h.flush();h.context.window.jrMap.update(localUpdate);h.context.window.jrMap.update(localUpdate);assert.equal(h.frames.length,1);h.flush();const fits=h.fits.length;h.context.window.jrMap.update({...localUpdate,driver:{...localUpdate.driver,lat:localUpdate.driver.lat+.00001}});h.flush();assert.equal(h.fits.length,fits);});
test('Leaflet recovery frames corrected authoritative target positions and remains provider compatible',()=>{const h=leafletHarness({...initial,dLat:37.422,dLng:-122.084,drLat:28.49,drLng:79.45});h.context.window.jrMap.update({...localUpdate,routeProvider:'osm'});assertLocalFit(h.fits.at(-1));h.context.window.jrMap.recenter();assertLocalFit(h.fits.at(-1));});
test('Google visual discontinuity resets only the trail and snaps current fix while keeping route geometry',()=>{const h=googleHarness({...initial,dLat:37.422,dLng:-122.084},{deferred:true,animate:true});h.flush();h.context.window.jrMap.update({...localUpdate,driver:{lat:37.423,lng:-122.083}});h.flush(1200);assert.ok(h.lines.some(l=>l.options.strokeOpacity===.45&&l.map));h.context.window.jrMap.update(localUpdate);h.flush(2400);const driver=h.markers.find(m=>m.html.includes('label driver'));assert.equal(driver.getPos().lat(),localUpdate.driver.lat);assert.ok(h.lines.filter(l=>l.options.strokeOpacity===.45).every(l=>!l.map));assert.ok(h.lines.some(l=>l.options.strokeColor==='#0F8A3C'&&l.map&&l.path.length===2));assertLocalFit(h.fits.at(-1));});
test('Leaflet visual discontinuity removes stale trail without removing current route or driver',()=>{const h=leafletHarness({...initial,dLat:37.422,dLng:-122.084});h.context.window.jrMap.update({...localUpdate,driver:{lat:37.423,lng:-122.083},routeProvider:'osm'});assert.ok([...h.attached].some(l=>l.options.className==='jr-trail'));h.context.window.jrMap.update({...localUpdate,routeProvider:'osm'});assert.ok(![...h.attached].some(l=>l.options.className==='jr-trail'));assert.ok([...h.attached].some(l=>l.options.className==='jr-navroute'));assert.equal(h.markers.find(m=>m.options.icon.html.includes('label driver')).getLatLng().lat,localUpdate.driver.lat);});
