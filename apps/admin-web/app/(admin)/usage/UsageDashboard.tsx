'use client';
import { useEffect, useState } from 'react';
import type { UsageSnapshot } from '../../../lib/usageModel';
import styles from './usage.module.css';
import KeepWarm from './KeepWarm';
import UsagePlanner from './UsagePlanner';
const fmt=(n:number)=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);
const date=(s:string)=>new Date(s).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
export default function UsageDashboard() {
 const [data,setData]=useState<UsageSnapshot|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load() {setBusy(true);setError('');try {const r=await fetch('/api/usage',{cache:'no-store',credentials:'same-origin',redirect:'error'});if(!r.ok)throw new Error('Usage could not be loaded. Check your admin session and try again.');setData(await r.json());}catch{setError('Usage could not be loaded. Check your admin session and try again.');}finally{setBusy(false);}}
 useEffect(()=>{void load();},[]);
 return <section className={styles.page}>
  <header className={styles.header}><div><p className={styles.eyebrow}>HOSTING ALLOWANCES</p><h1>Monthly usage</h1><p>See reported usage and planning estimates before free allowances run out.</p></div><button onClick={()=>void load()} disabled={busy} className={styles.button}>{busy?'Checking…':'Refresh readings'}</button></header>
  <KeepWarm />
  <p className={styles.meta}><strong>Estimates, not a live bill.</strong> Includes rides, tests, downloads and backups. Readings can lag; provider dashboards are authoritative.</p>
  <p className={styles.meta} aria-live="polite">{data?`Checked ${date(data.checkedAt)}. Next provider refresh after ${date(data.refreshAfter)}.`:'Loading usage readings…'}</p>
  {error&&<p role="alert" className={styles.error}>{error} {data?'Previous readings remain visible.':''}</p>}
  {data?.errors.length?<div role="status" className={styles.notice}>{data.errors.map(x=><p key={x}>{x}</p>)}</div>:null}
  <div className={styles.grid}>{data?.meters.map(m=>{const upper=m.method==='current-resource-ceiling';return <article key={m.id} className={styles.card}>
   <div className={styles.cardTop}><span className={styles.eyebrow}>{m.provider}</span><span className={styles.badge}>{m.kind==='reported'?'Reported · may lag':m.kind==='estimate'?(m.method==='normalized-counter'?'Counter estimate · may lag':`Estimate · ${m.confidence} confidence`):'Reading unavailable'}</span></div>
   <h2>{m.title}</h2>
   <div className={styles.value}>{m.percent===null?'Unavailable':`${upper?'Up to ~':m.kind==='estimate'?'~':''}${fmt(m.percent)}%`}<span> of free allowance{m.percent!==null&&m.percent>100?' · above the allowance':''}</span></div>
   {m.percent!==null?<><progress aria-label={`${m.provider} ${m.title}${upper?' estimated high-side use':''}`} max={100} value={Math.min(100,m.percent)} className={styles.progress}/><div className={styles.scale}><span>0%</span><span>100%</span></div></>:<div className={styles.unavailable}>No reliable input available. Missing data is not zero usage.</div>}
   <p className={styles.amount}>{m.used===null?'Usage unknown':`${upper?'Modelled use up to ':m.kind==='reported'?'Last reported use ':'Estimated use '}${fmt(m.used)} ${m.unit}`} / {fmt(m.limit)} {m.unit}</p>
   <p><strong>{m.remaining===null?'Remaining unknown':`${upper?'Modelled remaining':m.kind==='reported'?'Remaining at last reading':'Estimated remaining'}: ${fmt(m.remaining)} ${m.unit}`}</strong></p>
   <p className={styles.meta}>Period: {date(m.periodStart)} to {date(m.periodEnd)}{m.dataThrough?<><br/>Latest hourly point starts: {date(m.dataThrough)}</>:null}</p>
   <details><summary>Source and assumptions</summary><p>{m.source}</p><p>{m.note}</p></details>
  </article>;})}</div>
  <UsagePlanner baseline={data?.meters.find(m=>m.id==='render-bandwidth')??null} />
  <aside className={styles.notice}><strong>Keeping services awake uses shared hours.</strong> Two services running continuously use 1,488 hours in a 31-day month; the free workspace allowance is 750. Three services use 2,232 hours. A 30-second ping does not increase the allowance.</aside>
  <footer className={styles.sources}><a href="https://console.neon.tech" target="_blank" rel="noreferrer">Open Neon dashboard</a><a href="https://dashboard.render.com" target="_blank" rel="noreferrer">Open Render dashboard</a><a href="https://neon.com/pricing" target="_blank" rel="noreferrer">Neon allowances</a><a href="https://neon.com/docs/guides/consumption-limits" target="_blank" rel="noreferrer">Neon counter method</a><a href="https://render.com/docs/free" target="_blank" rel="noreferrer">Render free limits</a></footer>
 </section>;
}
