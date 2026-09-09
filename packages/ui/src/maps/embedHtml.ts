import type { MapProviderConfig } from "../components/MapEmbed";

/**
 * v2.2.0 — the live-ride map document, split out of MapEmbed.tsx.
 *
 * Framework-free on purpose: MapEmbed.tsx imports react-native, which cannot
 * load outside a device runtime, so keeping the HTML builder here is what makes
 * the renderer testable in a plain browser. Its sibling pickerHtml.ts does the
 * same for the address picker.
 */
export type InitShape = {
  pLat: number; pLng: number; pLabel: string;
  dLat: number | null; dLng: number | null; dLabel: string;
  drLat: number | null; drLng: number | null; drLabel: string;
  routePath: Array<[number, number]> | null;
};

/**
 * Pin markup + route styling, shared verbatim by both renderers so the map
 * looks identical whichever one is active.
 */
const SHARED_CSS = `
html,body,#map{height:100%;margin:0;padding:0;background:#eef2f7;font-family:-apple-system,Roboto,sans-serif}
.leaflet-control-zoom,.leaflet-bottom.leaflet-right,.leaflet-control-attribution{display:none !important}
.jr-pin{transform:translate(-50%,-100%);pointer-events:none}
.jr-pin .label{background:#E5322B;color:#fff;font-weight:700;padding:5px 10px;border-radius:14px;font-size:11px;letter-spacing:.3px;box-shadow:0 6px 14px rgba(229,50,43,.35), 0 2px 4px rgba(0,0,0,.2);white-space:nowrap;display:inline-block}
.jr-pin .label.driver{background:#1E5EFF;box-shadow:0 6px 14px rgba(30,94,255,.35), 0 2px 4px rgba(0,0,0,.2)}
.jr-pin .label.drop{background:#0F172A;box-shadow:0 6px 14px rgba(15,23,42,.35), 0 2px 4px rgba(0,0,0,.2)}
.jr-pin .dot{width:14px;height:14px;border-radius:50%;background:#E5322B;border:3px solid #fff;box-shadow:0 0 0 4px rgba(229,50,43,.18), 0 4px 10px rgba(0,0,0,.25);margin:6px auto 0;position:relative}
.jr-pin .dot.driver{background:#1E5EFF;box-shadow:0 0 0 4px rgba(30,94,255,.18), 0 4px 10px rgba(0,0,0,.25)}
.jr-pin .dot.drop{background:#0F172A;box-shadow:0 0 0 4px rgba(15,23,42,.18), 0 4px 10px rgba(0,0,0,.25)}
.jr-pin .pulse{position:absolute;top:50%;left:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#1E5EFF;animation:jrPulse 1.6s ease-out infinite;opacity:.7}
@keyframes jrPulse {
  0% { transform:scale(1); opacity:.7 }
  100% { transform:scale(3.2); opacity:0 }
}
.jr-route{stroke:#1E5EFF;stroke-width:4;stroke-linecap:round;fill:none;opacity:.85}
.jr-trail{stroke:#1E5EFF;stroke-width:3;stroke-linecap:round;fill:none;opacity:.45}
.jr-navroute{stroke:#0F8A3C;stroke-width:5;stroke-linecap:round;fill:none;opacity:.9}
.gm-style .jr-pin{position:absolute}
`;

/** Pin HTML, identical in both renderers. */
const PIN_JS = `
// Labels are caller-supplied and can carry real data (patient name, ambulance
// number, hospital name), so they are escaped before ever reaching innerHTML.
// The label lands in TEXT position, never inside an attribute, but quotes are
// escaped too so that stays true even if the markup is restructured later.
var JR_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function jrEscape(s){
  return String(s).replace(/[&<>"']/g, function(c){ return JR_ESC[c]; });
}
function jrPinHtml(label, kind){
  // kind is always an internal literal ('pickup' | 'driver' | 'drop'), never
  // caller data — guarded here so it can never become a class-attribute escape.
  var safeKind = (kind === 'driver' || kind === 'drop' || kind === 'pickup') ? kind : '';
  var labelCls = 'label' + (safeKind ? ' ' + safeKind : '');
  var dotCls   = 'dot'   + (safeKind ? ' ' + safeKind : '');
  var pulseHtml = safeKind === 'driver' ? '<span class="pulse"></span>' : '';
  return '<div style="text-align:center"><span class="'+labelCls+'">'+jrEscape(label)+'</span><div class="'+dotCls+'">'+pulseHtml+'</div></div>';
}
function jrReady(){
  if (window.ReactNativeWebView) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'jr:map:ready' })); } catch (e) {}
  }
  // Replay an update that arrived before the renderer finished booting.
  if (window.jrPending && window.jrMap) {
    try { window.jrMap.update(window.jrPending); } catch (e) {}
    window.jrPending = null;
  }
}
`;

/**
 * Leaflet + raster tiles. Kept as its own builder because the Google path
 * embeds it verbatim as a self-healing fallback — one source of truth for the
 * degraded renderer.
 */
function leafletBootJs(tileUrl: string, tileAttribution: string): string {
  return `
window.__jrBootLeaflet = function(INIT){
  if (window.__jrLeafletBooted) return;
  window.__jrLeafletBooted = true;

  function start(){
    function makePin(label, kind){
      return L.divIcon({ className: 'jr-pin', html: jrPinHtml(label, kind), iconSize: null, iconAnchor: [0, 0] });
    }

    var pickup = [INIT.pLat, INIT.pLng];
    var initialDriver = (INIT.dLat != null && INIT.dLng != null) ? [INIT.dLat, INIT.dLng] : null;
    var initialDrop   = (INIT.drLat != null && INIT.drLng != null) ? [INIT.drLat, INIT.drLng] : null;

    var map = L.map('map', { zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: false, doubleClickZoom: false }).setView(pickup, 14);
    L.tileLayer(${JSON.stringify(tileUrl)}, { attribution: ${JSON.stringify(tileAttribution)}, maxZoom: 19, detectRetina: true }).addTo(map);

    var pickupMarker = L.marker(pickup, { icon: makePin(INIT.pLabel, 'pickup') }).addTo(map);
    var driverMarker = initialDriver ? L.marker(initialDriver, { icon: makePin(INIT.dLabel, 'driver') }).addTo(map) : null;
    var dropMarker   = initialDrop   ? L.marker(initialDrop,   { icon: makePin(INIT.drLabel, 'drop')   }).addTo(map) : null;
    var route = null, trail = null, navRoute = null;
    var trailCoords = initialDriver ? [initialDriver.slice()] : [];

    function setNavRoute(coords){
      if (coords && coords.length > 1){
        if (navRoute){ navRoute.setLatLngs(coords); }
        else { navRoute = L.polyline(coords, { className:'jr-navroute', color:'#0F8A3C', weight:5, opacity:.9 }).addTo(map); }
        if (route){ map.removeLayer(route); route = null; }
      } else if (navRoute){ map.removeLayer(navRoute); navRoute = null; }
    }
    function refreshRoute(){
      if (navRoute) { if (route) { map.removeLayer(route); route = null; } return; }
      if (!driverMarker) { if (route) { map.removeLayer(route); route = null; } return; }
      var from = driverMarker.getLatLng(), to = pickupMarker.getLatLng();
      if (route) { route.setLatLngs([from, to]); }
      else { route = L.polyline([from, to], { className: 'jr-route', color: '#1E5EFF', weight: 4, opacity: .85 }).addTo(map); }
    }
    function refreshTrail(){
      if (trailCoords.length < 2) { if (trail) { map.removeLayer(trail); trail = null; } return; }
      if (trail) { trail.setLatLngs(trailCoords); }
      else { trail = L.polyline(trailCoords, { className: 'jr-trail', color: '#1E5EFF', weight: 3, opacity: .45 }).addTo(map); }
    }
    function fitAll(animate){
      var pts = [pickupMarker];
      if (driverMarker) pts.push(driverMarker);
      if (dropMarker) pts.push(dropMarker);
      if (navRoute) pts.push(navRoute);
      if (pts.length < 2) return;
      map.fitBounds(L.featureGroup(pts).getBounds().pad(0.4), { animate: !!animate, duration: 0.7 });
    }
    function animateMarkerTo(marker, target){
      if (!marker) return;
      var start = marker.getLatLng();
      var startLat = start.lat, startLng = start.lng, endLat = target[0], endLng = target[1];
      if (Math.abs(startLat - endLat) < 1e-6 && Math.abs(startLng - endLng) < 1e-6) return;
      var dur = 1200, t0 = performance.now();
      function step(t){
        var p = Math.min(1, (t - t0) / dur);
        var e = 1 - Math.pow(1 - p, 3);
        marker.setLatLng([startLat + (endLat - startLat) * e, startLng + (endLng - startLng) * e]);
        refreshRoute();
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    if (INIT.routePath) setNavRoute(INIT.routePath);
    refreshRoute();
    fitAll(false);

    window.jrMap = {
      update: function(payload){
        try {
          if (payload.pickup) pickupMarker.setLatLng([payload.pickup.lat, payload.pickup.lng]);
          if (payload.driver) {
            var dpt = [payload.driver.lat, payload.driver.lng];
            if (!driverMarker) {
              driverMarker = L.marker(dpt, { icon: makePin(payload.driver.label || 'Driver', 'driver') }).addTo(map);
              trailCoords = [dpt.slice()];
              fitAll(true);
            } else {
              animateMarkerTo(driverMarker, dpt);
              var last = trailCoords.length ? trailCoords[trailCoords.length - 1] : null;
              if (!last || Math.abs(last[0] - dpt[0]) > 1e-5 || Math.abs(last[1] - dpt[1]) > 1e-5) {
                trailCoords.push(dpt.slice());
                if (trailCoords.length > 40) trailCoords.shift();
              }
            }
            refreshTrail();
          } else if (driverMarker) {
            map.removeLayer(driverMarker); driverMarker = null; trailCoords = [];
            refreshTrail(); refreshRoute();
          }
          if (payload.drop) {
            var drpt = [payload.drop.lat, payload.drop.lng];
            if (!dropMarker) { dropMarker = L.marker(drpt, { icon: makePin(payload.drop.label || 'Drop', 'drop') }).addTo(map); fitAll(true); }
            else { animateMarkerTo(dropMarker, drpt); }
          } else if (dropMarker) { map.removeLayer(dropMarker); dropMarker = null; }
          if (Object.prototype.hasOwnProperty.call(payload, 'routePath')) setNavRoute(payload.routePath || null);
        } catch (e) {
          // Don't crash the WebView on a bad update — drop it and keep the
          // current frame visible.
        }
      },
      recenter: function(){ fitAll(true); }
    };
    jrReady();
  }

  if (window.L) { start(); return; }
  // Loaded on demand only when Google is unavailable, so the happy path never
  // pays for Leaflet. Subresource-integrity hashes are the same pinned
  // leaflet@1.9.4 digests this file carried before v2.2.0 — do not drop them
  // when bumping the version, regenerate them.
  var css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  css.crossOrigin = 'anonymous';
  document.head.appendChild(css);
  var s = document.createElement('script');
  s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  s.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  s.crossOrigin = 'anonymous';
  s.onload = start;
  // If the CDN is unreachable or the digest fails, there is nothing further to
  // fall back to — surface it rather than spinning on a blank map.
  s.onerror = function(){
    var el = document.getElementById('map');
    if (el) el.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#64748B;font-size:13px">Map unavailable</div>';
  };
  document.body.appendChild(s);
};`;
}

/** Google Maps JavaScript API renderer — the real Google Maps UI. */
const GOOGLE_BOOT_JS = `
window.__jrBootGoogle = function(INIT){
  var map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: INIT.pLat, lng: INIT.pLng },
    zoom: 14,
    // Keep Google's own look and controls (that IS the Google Maps UI) but drop
    // the ones that make no sense in a small embedded ride card.
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    zoomControl: true,
    clickableIcons: false,
    // 'greedy' so a one-finger drag pans inside the WebView instead of being
    // swallowed as a page scroll.
    gestureHandling: 'greedy'
  });

  // Custom OverlayView pins: the map is Google's, the pins stay ours.
  function JrPin(latLng, label, kind){
    this.pos = latLng; this.html = jrPinHtml(label, kind); this.div = null;
    this.setMap(map);
  }
  JrPin.prototype = new google.maps.OverlayView();
  JrPin.prototype.onAdd = function(){
    var d = document.createElement('div');
    d.className = 'jr-pin';
    d.style.position = 'absolute';
    d.innerHTML = this.html;
    this.div = d;
    this.getPanes().floatPane.appendChild(d);
  };
  JrPin.prototype.draw = function(){
    if (!this.div) return;
    var proj = this.getProjection();
    if (!proj) return;
    var p = proj.fromLatLngToDivPixel(this.pos);
    if (!p) return;
    this.div.style.left = p.x + 'px';
    this.div.style.top = p.y + 'px';
  };
  JrPin.prototype.onRemove = function(){
    if (this.div && this.div.parentNode) this.div.parentNode.removeChild(this.div);
    this.div = null;
  };
  JrPin.prototype.setPos = function(latLng){ this.pos = latLng; this.draw(); };
  JrPin.prototype.getPos = function(){ return this.pos; };

  function ll(lat, lng){ return new google.maps.LatLng(lat, lng); }

  var pickupMarker = new JrPin(ll(INIT.pLat, INIT.pLng), INIT.pLabel, 'pickup');
  var driverMarker = (INIT.dLat != null) ? new JrPin(ll(INIT.dLat, INIT.dLng), INIT.dLabel, 'driver') : null;
  var dropMarker   = (INIT.drLat != null) ? new JrPin(ll(INIT.drLat, INIT.drLng), INIT.drLabel, 'drop') : null;
  var route = null, trail = null, navRoute = null;
  var trailCoords = (INIT.dLat != null) ? [ll(INIT.dLat, INIT.dLng)] : [];

  function line(path, color, weight, opacity){
    return new google.maps.Polyline({ path: path, strokeColor: color, strokeWeight: weight, strokeOpacity: opacity, map: map, clickable: false });
  }
  function setNavRoute(coords){
    if (coords && coords.length > 1){
      var path = coords.map(function(c){ return ll(c[0], c[1]); });
      if (navRoute) { navRoute.setPath(path); }
      else { navRoute = line(path, '#0F8A3C', 5, 0.9); }
      if (route) { route.setMap(null); route = null; }
    } else if (navRoute) { navRoute.setMap(null); navRoute = null; }
  }
  function refreshRoute(){
    if (navRoute) { if (route) { route.setMap(null); route = null; } return; }
    if (!driverMarker) { if (route) { route.setMap(null); route = null; } return; }
    var path = [driverMarker.getPos(), pickupMarker.getPos()];
    if (route) { route.setPath(path); } else { route = line(path, '#1E5EFF', 4, 0.85); }
  }
  function refreshTrail(){
    if (trailCoords.length < 2) { if (trail) { trail.setMap(null); trail = null; } return; }
    if (trail) { trail.setPath(trailCoords); } else { trail = line(trailCoords, '#1E5EFF', 3, 0.45); }
  }
  function fitAll(){
    var b = new google.maps.LatLngBounds();
    var n = 0;
    b.extend(pickupMarker.getPos()); n++;
    if (driverMarker) { b.extend(driverMarker.getPos()); n++; }
    if (dropMarker) { b.extend(dropMarker.getPos()); n++; }
    if (navRoute) { navRoute.getPath().forEach(function(p){ b.extend(p); }); n++; }
    if (n < 2) { map.setCenter(pickupMarker.getPos()); map.setZoom(14); return; }
    // Matches Leaflet's .pad(0.4) closely enough at this card size.
    map.fitBounds(b, 48);
  }
  function animateMarkerTo(marker, lat, lng){
    if (!marker) return;
    var s = marker.getPos(), sLat = s.lat(), sLng = s.lng();
    if (Math.abs(sLat - lat) < 1e-6 && Math.abs(sLng - lng) < 1e-6) return;
    var dur = 1200, t0 = performance.now();
    function step(t){
      var p = Math.min(1, (t - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      marker.setPos(ll(sLat + (lat - sLat) * e, sLng + (lng - sLng) * e));
      refreshRoute();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (INIT.routePath) setNavRoute(INIT.routePath);
  refreshRoute();
  google.maps.event.addListenerOnce(map, 'idle', function(){ fitAll(); });

  window.jrMap = {
    update: function(payload){
      try {
        if (payload.pickup) pickupMarker.setPos(ll(payload.pickup.lat, payload.pickup.lng));
        if (payload.driver) {
          if (!driverMarker) {
            driverMarker = new JrPin(ll(payload.driver.lat, payload.driver.lng), payload.driver.label || 'Driver', 'driver');
            trailCoords = [ll(payload.driver.lat, payload.driver.lng)];
            fitAll();
          } else {
            animateMarkerTo(driverMarker, payload.driver.lat, payload.driver.lng);
            var last = trailCoords.length ? trailCoords[trailCoords.length - 1] : null;
            if (!last || Math.abs(last.lat() - payload.driver.lat) > 1e-5 || Math.abs(last.lng() - payload.driver.lng) > 1e-5) {
              trailCoords.push(ll(payload.driver.lat, payload.driver.lng));
              if (trailCoords.length > 40) trailCoords.shift();
            }
          }
          refreshTrail();
        } else if (driverMarker) {
          driverMarker.setMap(null); driverMarker = null; trailCoords = [];
          refreshTrail(); refreshRoute();
        }
        if (payload.drop) {
          if (!dropMarker) { dropMarker = new JrPin(ll(payload.drop.lat, payload.drop.lng), payload.drop.label || 'Drop', 'drop'); fitAll(); }
          else { animateMarkerTo(dropMarker, payload.drop.lat, payload.drop.lng); }
        } else if (dropMarker) { dropMarker.setMap(null); dropMarker = null; }
        if (Object.prototype.hasOwnProperty.call(payload, 'routePath')) setNavRoute(payload.routePath || null);
      } catch (e) {
        // Don't crash the WebView on a bad update — drop it and keep the
        // current frame visible.
      }
    },
    recenter: function(){ fitAll(); }
  };
  jrReady();
};`;

export function buildEmbedHtml(init: InitShape, cfg: MapProviderConfig): string {
  const initJson = JSON.stringify(init);
  const leaflet = leafletBootJs(cfg.tileUrl, cfg.tileAttribution);

  if (cfg.provider !== "google" || !cfg.googleBrowserKey) {
    return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<style>${SHARED_CSS}</style>
</head>
<body>
<div id="map"></div>
<script>
${PIN_JS}
${leaflet}
window.__jrBootLeaflet(${initJson});
</script>
</body></html>`;
  }

  const keyParam = encodeURIComponent(cfg.googleBrowserKey);
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<style>${SHARED_CSS}</style>
</head>
<body>
<div id="map"></div>
<script>
var INIT = ${initJson};
${PIN_JS}
${leaflet}
${GOOGLE_BOOT_JS}

// Self-healing: any Google failure degrades to Leaflet + OSM rather than
// leaving a blank map on a live ride.
//
// This MUST run even when window.jrMap is already set. Google happily
// constructs a Map object with a bad key and only reports
// InvalidKeyMapError asynchronously afterwards, so an "is it built yet"
// guard would see a live jrMap, skip the fallback, and leave a permanently
// blank map. Verified against a deliberately invalid key.
function jrForceFallback(){
  window.jrMap = null;
  var el = document.getElementById('map');
  if (el) el.innerHTML = '';
  window.__jrLeafletBooted = false;
  window.__jrBootLeaflet(INIT);
}
// Tiles actually painted? .gm-style is Google's own wrapper, .leaflet-tile-pane
// Leaflet's. Neither present means nothing rendered, whatever jrMap claims.
function jrRendered(){
  return !!(document.querySelector('.gm-style') || document.querySelector('.leaflet-tile-pane'));
}
window.gm_authFailure = jrForceFallback;
window.jrGoogleInit = function(){
  try { window.__jrBootGoogle(INIT); } catch (e) { jrForceFallback(); }
};
setTimeout(function(){ if (!jrRendered()) jrForceFallback(); }, 6000);
</script>
<!-- No subresource-integrity hash here, deliberately: the Maps JS bootstrap is
     generated per request (it varies by key, channel and rollout) and Google
     publishes no stable digest for it, so an integrity attribute would break
     the map on their next push. The Leaflet fallback above IS pinned. -->
<script async
  src="https://maps.googleapis.com/maps/api/js?key=${keyParam}&callback=jrGoogleInit&loading=async&v=weekly"
  onerror="jrFallback()"></script>
</body></html>`;
}

