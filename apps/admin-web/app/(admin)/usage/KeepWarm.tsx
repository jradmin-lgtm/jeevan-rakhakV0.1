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
 return <div className={styles.keepwarm}>
  <p aria-live="polite"><strong>30-second keep warm</strong> · {error?'Latest liveness check unavailable.':status?status.services.map(s=>`${s.name}: ${s.state}`).join(' · '):'Checking service liveness…'}{status?` Checked ${new Date(status.checkedAt).toLocaleTimeString('en-IN')}.`:''}</p>
  <details><summary>When it runs</summary><p>Checks API and realtime health while this usage page is open. Stops when the page closes or the device sleeps; background tabs may be throttled. Uses shared Render free hours. These checks do not query the database.</p></details>
 </div>;
}
