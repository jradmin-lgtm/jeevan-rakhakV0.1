"use client";

import React, { useMemo, useRef } from "react";

/**
 * Hospital-portal live map (CR#3, v1.2.0).
 *
 * admin-web has no leaflet/react-leaflet dependency, so we render a
 * self-contained Leaflet document inside an <iframe srcDoc>. The doc loads
 * Leaflet from the same CDN the mobile MapEmbed uses and exposes a
 * `window.jrMap.update(...)` hook; we push ambulance / destination / route
 * changes into the already-loaded iframe via postMessage so the marker
 * animates in place instead of reloading the whole map on every 10s poll.
 *
 * Markers: ambulance (blue, pulsing) → destination hospital (dark). Optional
 * `routePath` ([lat,lng] pairs from OSRM) draws the real road line (green).
 */

type Pt = { lat: number; lng: number; label?: string };

type Props = {
  ambulance?: Pt | null;
  destination?: Pt | null;
  routePath?: Array<[number, number]> | null;
  height?: number;
};

const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_ATTR = "© OpenStreetMap · © CARTO";

export function HospitalMap({ ambulance, destination, routePath = null, height = 320 }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // Build the HTML once from the FIRST non-null coords we see so the map
  // doesn't reload on every poll. Subsequent updates go in via postMessage.
  const initialRef = useRef({
    aLat: ambulance ? Number(ambulance.lat) : null,
    aLng: ambulance ? Number(ambulance.lng) : null,
    dLat: destination ? Number(destination.lat) : null,
    dLng: destination ? Number(destination.lng) : null,
    routePath: routePath ?? null
  });

  const srcDoc = useMemo(() => buildHtml(initialRef.current), []);

  // Push updates into the iframe (animated, no reload).
  const routeKey = useMemo(() => {
    if (!routePath || routePath.length === 0) return "";
    const a = routePath[0];
    const b = routePath[routePath.length - 1];
    return `${routePath.length}:${a[0]},${a[1]}>${b[0]},${b[1]}`;
  }, [routePath]);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    const payload = {
      ambulance: ambulance ? { lat: ambulance.lat, lng: ambulance.lng, label: ambulance.label ?? "Ambulance" } : null,
      destination: destination ? { lat: destination.lat, lng: destination.lng, label: destination.label ?? "Hospital" } : null,
      routePath: routePath && routePath.length > 1 ? routePath : null
    };
    try {
      frame.contentWindow.postMessage({ type: "jr:map:update", payload }, "*");
    } catch {
      /* iframe not ready yet — next poll re-pushes */
    }
  }, [ambulance?.lat, ambulance?.lng, ambulance?.label, destination?.lat, destination?.lng, destination?.label, routeKey]);

  return (
    <iframe
      ref={frameRef}
      title="Live ambulance map"
      srcDoc={srcDoc}
      style={{ width: "100%", height, border: "1px solid var(--border)", borderRadius: 12, background: "#EEF2F7" }}
    />
  );
}

function buildHtml(init: {
  aLat: number | null; aLng: number | null;
  dLat: number | null; dLng: number | null;
  routePath: Array<[number, number]> | null;
}): string {
  const initJson = JSON.stringify(init);
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<style>
html,body,#map{height:100%;margin:0;padding:0;background:#eef2f7;font-family:-apple-system,Roboto,sans-serif}
.leaflet-control-attribution{font-size:9px;opacity:.6}
.jr-pin{transform:translate(-50%,-100%);pointer-events:none}
.jr-pin .label{background:#1E5EFF;color:#fff;font-weight:700;padding:5px 10px;border-radius:14px;font-size:11px;letter-spacing:.3px;box-shadow:0 6px 14px rgba(30,94,255,.35),0 2px 4px rgba(0,0,0,.2);white-space:nowrap;display:inline-block}
.jr-pin .label.dest{background:#0F172A;box-shadow:0 6px 14px rgba(15,23,42,.35),0 2px 4px rgba(0,0,0,.2)}
.jr-pin .dot{width:14px;height:14px;border-radius:50%;background:#1E5EFF;border:3px solid #fff;box-shadow:0 0 0 4px rgba(30,94,255,.18),0 4px 10px rgba(0,0,0,.25);margin:6px auto 0;position:relative}
.jr-pin .dot.dest{background:#0F172A;box-shadow:0 0 0 4px rgba(15,23,42,.18),0 4px 10px rgba(0,0,0,.25)}
.jr-pin .pulse{position:absolute;top:50%;left:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#1E5EFF;animation:jrPulse 1.6s ease-out infinite;opacity:.7}
@keyframes jrPulse{0%{transform:scale(1);opacity:.7}100%{transform:scale(3.2);opacity:0}}
.jr-navroute{stroke:#0F8A3C;stroke-width:5;stroke-linecap:round;fill:none;opacity:.9}
.jr-route{stroke:#1E5EFF;stroke-width:4;stroke-linecap:round;fill:none;opacity:.85}
.jr-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#64748B;font-size:13px}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function(){
  var INIT = ${initJson};
  function makePin(label, kind){
    var labelCls='label'+(kind?' '+kind:'');
    var dotCls='dot'+(kind?' '+kind:'');
    var pulseHtml=kind==='dest'?'':'<span class="pulse"></span>';
    var safe=String(label).replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;';});
    return L.divIcon({className:'jr-pin',html:'<div style="text-align:center"><span class="'+labelCls+'">'+safe+'</span><div class="'+dotCls+'">'+pulseHtml+'</div></div>',iconSize:null,iconAnchor:[0,0]});
  }
  var center = (INIT.aLat!=null)?[INIT.aLat,INIT.aLng]:(INIT.dLat!=null?[INIT.dLat,INIT.dLng]:[28.6139,77.2090]);
  var map=L.map('map',{zoomControl:true,attributionControl:true,scrollWheelZoom:true}).setView(center,13);
  L.tileLayer('${TILE_URL}',{attribution:'${TILE_ATTR}',maxZoom:19,detectRetina:true}).addTo(map);
  var ambMarker=(INIT.aLat!=null)?L.marker([INIT.aLat,INIT.aLng],{icon:makePin('Ambulance','')}).addTo(map):null;
  var destMarker=(INIT.dLat!=null)?L.marker([INIT.dLat,INIT.dLng],{icon:makePin('Hospital','dest')}).addTo(map):null;
  var navRoute=null, route=null;
  function setNavRoute(coords){
    if(coords&&coords.length>1){
      if(navRoute){navRoute.setLatLngs(coords);}else{navRoute=L.polyline(coords,{className:'jr-navroute',color:'#0F8A3C',weight:5,opacity:.9}).addTo(map);}
      if(route){map.removeLayer(route);route=null;}
    }else if(navRoute){map.removeLayer(navRoute);navRoute=null;}
  }
  function refreshRoute(){
    if(navRoute){if(route){map.removeLayer(route);route=null;}return;}
    if(!ambMarker||!destMarker){if(route){map.removeLayer(route);route=null;}return;}
    var from=ambMarker.getLatLng(), to=destMarker.getLatLng();
    if(route){route.setLatLngs([from,to]);}else{route=L.polyline([from,to],{className:'jr-route',color:'#1E5EFF',weight:4,opacity:.85}).addTo(map);}
  }
  function fitAll(animate){
    var pts=[]; if(ambMarker)pts.push(ambMarker); if(destMarker)pts.push(destMarker); if(navRoute)pts.push(navRoute);
    if(pts.length<1)return; if(pts.length<2){map.setView(pts[0].getLatLng?pts[0].getLatLng():center,14);return;}
    var g=L.featureGroup(pts); map.fitBounds(g.getBounds().pad(0.4),{animate:!!animate,duration:0.7});
  }
  if(INIT.routePath)setNavRoute(INIT.routePath);
  refreshRoute(); fitAll(false);
  function animateTo(marker,target){
    if(!marker)return; var s=marker.getLatLng(); var sLat=s.lat,sLng=s.lng,eLat=target[0],eLng=target[1];
    if(Math.abs(sLat-eLat)<1e-6&&Math.abs(sLng-eLng)<1e-6)return;
    var dur=1200,t0=performance.now();
    function step(t){var p=Math.min(1,(t-t0)/dur);var e=1-Math.pow(1-p,3);marker.setLatLng([sLat+(eLat-sLat)*e,sLng+(eLng-sLng)*e]);refreshRoute();if(p<1)requestAnimationFrame(step);}
    requestAnimationFrame(step);
  }
  window.addEventListener('message',function(ev){
    var d=ev.data; if(!d||d.type!=='jr:map:update'||!d.payload)return; var p=d.payload;
    try{
      if(p.ambulance){var apt=[p.ambulance.lat,p.ambulance.lng];
        if(!ambMarker){ambMarker=L.marker(apt,{icon:makePin(p.ambulance.label||'Ambulance','')}).addTo(map);fitAll(true);}
        else{animateTo(ambMarker,apt);}}
      else if(ambMarker){map.removeLayer(ambMarker);ambMarker=null;refreshRoute();}
      if(p.destination){var dpt=[p.destination.lat,p.destination.lng];
        if(!destMarker){destMarker=L.marker(dpt,{icon:makePin(p.destination.label||'Hospital','dest')}).addTo(map);fitAll(true);}
        else{animateTo(destMarker,dpt);}}
      else if(destMarker){map.removeLayer(destMarker);destMarker=null;}
      if(Object.prototype.hasOwnProperty.call(p,'routePath'))setNavRoute(p.routePath||null);
    }catch(e){}
  });
})();
</script>
</body></html>`;
}
