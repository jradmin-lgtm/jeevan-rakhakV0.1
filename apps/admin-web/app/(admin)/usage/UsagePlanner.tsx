'use client';
import { useState } from 'react';
import { planRenderUsage, USAGE_PLANNING, type UsageMeter } from '../../../lib/usageModel';
import styles from './usage.module.css';
const fmt=(n:number)=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);
function inputNumber(value:string) { return value.trim()===''?NaN:Number(value); }
export default function UsagePlanner({baseline}:{baseline:UsageMeter|null}) {
 const [rideHours,setRideHours]=useState('10'),[apks,setApks]=useState('10'),[backups,setBackups]=useState('4');
 const plan=planRenderUsage({rideHours:inputNumber(rideHours),apkDownloads:inputNumber(apks),changedBackups:inputNumber(backups)},baseline?.used??null);
 return <section className={styles.planner} aria-labelledby="usage-planner-title">
  <p className={styles.eyebrow}>EDITABLE SCENARIO · LOW CONFIDENCE</p><h2 id="usage-planner-title">Plan the rest of this month</h2>
  <p>Estimate additional Render traffic before reset. The starting numbers are examples, not expected demand. Enter only activity still to come; earlier usage is already in the latest provider baseline.</p>
  <div className={styles.inputs}>
   <label htmlFor="usage-ride-hours">Additional active ride-hours<input id="usage-ride-hours" type="number" min="0" max="100000" step="0.5" value={rideHours} onChange={e=>setRideHours(e.target.value)} aria-describedby="usage-ride-hint"/><small id="usage-ride-hint">{USAGE_PLANNING.rideHourMB} MB/hour. Example: 20 rides of 30 minutes = 10 hours.</small></label>
   <label htmlFor="usage-apks">Additional APK downloads<input id="usage-apks" type="number" min="0" max="100000" step="1" value={apks} onChange={e=>setApks(e.target.value)}/><small>{USAGE_PLANNING.apkMB} MB/download. Count each complete app download separately.</small></label>
   <label htmlFor="usage-backups">Additional changed full backups<input id="usage-backups" type="number" min="0" max="100000" step="1" value={backups} onChange={e=>setBackups(e.target.value)}/><small>{USAGE_PLANNING.changedBackupMB} MB/upload. Unchanged snapshots that skip upload count as zero.</small></label>
  </div>
  {!plan?<p role="alert" className={styles.error}>Enter non-negative values up to 100,000. Downloads and backups must be whole numbers.</p>:<div className={styles.planResults} aria-live="polite">
   <div><span>Additional scenario traffic</span><strong>{fmt(plan.additionalGB)} GB</strong><small>~{fmt(plan.scenarioPercent)}% of the 5 GB allowance</small></div>
   <div><span>Latest provider baseline</span><strong>{plan.baselineGB===null?'Unknown':`${fmt(plan.baselineGB)} GB`}</strong><small>Hourly estimate; may lag and omit deleted resources</small></div>
   <div><span>Baseline + scenario</span><strong>{plan.projectedGB===null?'Total unknown':`~${fmt(plan.projectedPercent!)}%`}</strong><small>{plan.projectedGB===null?'No zero baseline is assumed.':`${fmt(plan.projectedGB)} GB modelled; ${fmt(plan.remainingGB!)} GB remaining in this model${plan.projectedPercent!>100?' · above allowance':''}`}</small></div>
  </div>}
  {plan?.projectedPercent!==null&&plan?.projectedPercent!==undefined?<progress className={styles.progress} max={100} value={Math.min(100,plan.projectedPercent)} aria-label="Estimated Render bandwidth after additional scenario"/>:null}
  <details className={styles.planDetails}><summary>Measured assumptions and limits</summary>
   <ul><li>Ride activity: {USAGE_PLANNING.rideHourMB} MB of decoded application JSON per active ride-hour, measured at 5-second booking and GPS cadence. This is a traffic-size observation from a run that failed its latency target, not proof of capacity.</li><li>APK: {USAGE_PLANNING.apkMB} MB per complete download, based on current build sizes. Partial downloads and retries can add traffic.</li><li>Changed complete snapshot: {USAGE_PLANNING.changedBackupMB} MB per upload, based on the current database snapshot. As data grows, the size changes.</li></ul>
   <p>This simplified sum excludes HTTP/TLS overhead, compression effects, socket events, maps/provider traffic, most portal traffic and future data growth. Ride JSON includes request and response payload and is not a measured outbound wire total. The result can understate or overstate actual Render billing. Neon database transfer is separate and is not inferred from these values. This is not a monthly ride guarantee.</p>
   {plan?<p>Breakdown: rides {fmt(plan.rideMB)} MB + APKs {fmt(plan.apkMB)} MB + backups {fmt(plan.backupMB)} MB.</p>:null}
  </details>
 </section>;
}
