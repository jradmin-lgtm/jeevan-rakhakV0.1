'use client';
import { useEffect,useState } from 'react';
import type { KeepaliveResult } from '../../../lib/keepalive';
import styles from './usage.module.css';
export default function KeepWarm() {
 const [status,setStatus]=useState<KeepaliveResult|null>(null),[error,setError]=useState(false);
 useEffect(()=>{
  let active=true,busy=false; const controller=new AbortController();
  const tick=async()=>{if(busy||!active)return;busy=true;try{const r=await fetch('/api/keepalive',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});if(!r.ok)throw new Error('unavailable');const value=await r.json();if(active){setStatus(value);setError(false);}}catch{if(active)setError(true);}finally{busy=false;}};
  void tick();const timer=setInterval(()=>void tick(),30000);
  return()=>{active=false;clearInterval(timer);controller.abort();};
 },[]);
 return <div className={styles.notice}><strong>Keep warm while this usage page is open</strong><p>30-second liveness checks for API and realtime. Stops when this page closes or the device sleeps; browsers may throttle background tabs. Uses shared Render free hours. No database health query.</p><p aria-live="polite">{error?'Latest liveness check unavailable.':status?status.services.map(s=>`${s.name}: ${s.state}`).join(' · '):'Checking service liveness…'}{status?` Last check ${new Date(status.checkedAt).toLocaleTimeString('en-IN')}.`:''}</p></div>;
}
