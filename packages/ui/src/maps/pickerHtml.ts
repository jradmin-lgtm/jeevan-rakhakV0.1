import type { MapProviderConfig } from "../components/MapEmbed";

/**
 * v2.2.0 — the drag-to-pick address map, shared by both apps.
 *
 * This was duplicated byte-for-byte in user-app and driver-app
 * MapLocationPicker.tsx, each with its own hardcoded CartoDB tile URL. When
 * CARTO began watermarking anonymous tiles on 2026-09-09 both copies broke and
 * both had to be found and fixed. One builder now, provider chosen at runtime.
 *
 * CONTRACT (unchanged from the Leaflet original, both renderers honour it):
 *  - postMessage `{ type:'center', lat, lng }`, debounced 200ms while dragging,
 *    plus one initial emit shortly after boot.
 *  - `window.jrMap.flyTo(lat, lng, zoomLevel?)` to jump to a search result or
 *    GPS fix without reloading the page.
 */
export function buildPickerHtml(
  initial: { lat: number; lng: number },
  zoom: number,
  cfg?: MapProviderConfig | null
): string {
  const useGoogle = !!(cfg && cfg.provider === "google" && cfg.googleBrowserKey);
  const tileUrl = cfg?.tileUrl || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attr = cfg?.tileAttribution || "© OpenStreetMap contributors";

  const head = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<style>
html,body,#map{height:100%;margin:0;padding:0;background:#eef2f7;font-family:-apple-system,Roboto,sans-serif}
.leaflet-control-zoom,.leaflet-bottom.leaflet-right,.leaflet-control-attribution{display:none !important}
</style>
</head>
<body>
<div id="map"></div>`;

  // Shared by both renderers so the debounce timing and message shape can never
  // drift between them.
  const emitJs = `
var jrDt = null;
function jrPostCenter(lat, lng){
  if (!window.ReactNativeWebView) return;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'center', lat: lat, lng: lng }));
}
function jrOnMove(getCenter){
  if (jrDt) clearTimeout(jrDt);
  jrDt = setTimeout(function(){ var c = getCenter(); jrPostCenter(c.lat, c.lng); }, 200);
}`;

  const leafletJs = `
window.__jrBootLeafletPicker = function(){
  // No window.jrMap guard here: the caller clears jrMap before forcing a
  // recovery, and the picker only ever boots Leaflet deliberately.
  if (window.__jrLeafletPickerBooting) return;
  window.__jrLeafletPickerBooting = true;
  function start(){
    var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${initial.lat}, ${initial.lng}], ${zoom});
    L.tileLayer(${JSON.stringify(tileUrl)}, { attribution: ${JSON.stringify(attr)}, maxZoom: 19, detectRetina: true }).addTo(map);
    map.on('move', function(){ jrOnMove(function(){ var c = map.getCenter(); return { lat: c.lat, lng: c.lng }; }); });
    setTimeout(function(){ var c = map.getCenter(); jrPostCenter(c.lat, c.lng); }, 50);
    window.jrMap = {
      flyTo: function(lat, lng, zoomLevel){ map.flyTo([lat, lng], zoomLevel || 17, { duration: 0.7 }); }
    };
    window.__jrLeafletPickerBooting = false;
  }
  if (window.L) { start(); return; }
  // Pinned leaflet@1.9.4 digests. Do not drop these when bumping the version.
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
  s.onerror = function(){
    var el = document.getElementById('map');
    if (el) el.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;color:#64748B;font-size:13px">Map unavailable</div>';
  };
  document.body.appendChild(s);
};`;

  if (!useGoogle) {
    return `${head}
<script>
${emitJs}
${leafletJs}
window.__jrBootLeafletPicker();
</script>
</body></html>`;
  }

  const keyParam = encodeURIComponent(cfg!.googleBrowserKey);
  return `${head}
<script>
${emitJs}
${leafletJs}

window.jrGooglePickerInit = function(){
  try {
    if (window.jrMap) return;
    var map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: ${initial.lat}, lng: ${initial.lng} },
      zoom: ${zoom},
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      clickableIcons: false,
      gestureHandling: 'greedy'
    });
    map.addListener('center_changed', function(){
      jrOnMove(function(){ var c = map.getCenter(); return { lat: c.lat(), lng: c.lng() }; });
    });
    google.maps.event.addListenerOnce(map, 'idle', function(){
      var c = map.getCenter();
      jrPostCenter(c.lat(), c.lng());
    });
    window.jrMap = {
      flyTo: function(lat, lng, zoomLevel){
        map.setZoom(zoomLevel || 17);
        map.panTo({ lat: lat, lng: lng });
      }
    };
  } catch (e) { window.__jrBootLeafletPicker(); }
};

// Any Google failure degrades to Leaflet + OSM rather than leaving the picker
// on a blank map with a confirm button the user cannot meaningfully press.
//
// Forced, not guarded on window.jrMap: Google builds a Map object with a bad
// key and only reports InvalidKeyMapError afterwards, so a "already built"
// check would skip the recovery and strand the picker on a blank canvas.
function jrPickerFallback(){
  window.jrMap = null;
  var el = document.getElementById('map');
  if (el) el.innerHTML = '';
  window.__jrBootLeafletPicker();
}
function jrPickerRendered(){
  return !!(document.querySelector('.gm-style') || document.querySelector('.leaflet-tile-pane'));
}
window.gm_authFailure = jrPickerFallback;
setTimeout(function(){ if (!jrPickerRendered()) jrPickerFallback(); }, 6000);
</script>
<!-- No SRI: the Maps JS bootstrap is generated per request and Google
     publishes no stable digest. The Leaflet fallback above IS pinned. -->
<script async
  src="https://maps.googleapis.com/maps/api/js?key=${keyParam}&callback=jrGooglePickerInit&loading=async&v=weekly"
  onerror="window.__jrBootLeafletPicker()"></script>
</body></html>`;
}
