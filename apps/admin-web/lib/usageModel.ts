export type UsageMeter = { id: string; provider: string; title: string; used: number | null; limit: number; unit: string; percent: number | null; remaining: number | null; kind: 'estimate' | 'reported' | 'unavailable'; confidence: 'low' | 'medium'; note: string; source: string; periodStart: string; periodEnd: string; dataThrough: string | null };
export type UsageSnapshot = { checkedAt: string; refreshAfter: string; meters: UsageMeter[]; errors: string[] };
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export function meter(input: Omit<UsageMeter, 'percent' | 'remaining'>): UsageMeter {
 const used = number(input.used) ? input.used : null;
 return { ...input, used, percent: used === null ? null : 100 * used / input.limit, remaining: used === null ? null : Math.max(0, input.limit - used) };
}
export function monthPeriod(now: number) { const d = new Date(now); return { periodStart: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(), periodEnd: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 1)).toISOString() }; }
export function validPeriod(start: unknown, end: unknown, now: number) { return typeof start === 'string' && typeof end === 'string' && Number.isFinite(Date.parse(start)) && Date.parse(start) <= now && Date.parse(end) > now; }
export function elapsedHours(created: unknown, periodStart: string, now: number): number | null {
 if(typeof created !== 'string' || !Number.isFinite(Date.parse(created)) || Date.parse(created)>now) return null;
 return Math.max(0,now-Math.max(Date.parse(created),Date.parse(periodStart)))/3600000;
}
// Use only the aggregate endpoint. Never add total plus traffic-source breakdown.
export function bandwidthEstimate(rows: unknown, resources: string[], start: string, now: number): { mb: number; through: string } | null {
 if (!Array.isArray(rows) || !rows.length || !resources.length) return null;
 let mb=0, through=0; const found=new Set<string>(), points=new Set<string>();
 for(const row of rows) {
  const id=row?.labels?.find((l: {field: string})=>l.field==='resource')?.value;
  if(!resources.includes(id) || found.has(id) || !Array.isArray(row.values) || !row.values.length) return null;
  found.add(id);
  const factor: Record<string,number>={b:1/1e6,bytes:1/1e6,kb:.001,mb:1,gb:1000};
  const f=factor[String(row.unit).toLowerCase()]; if(f===undefined)return null;
  for(const p of row.values) { const t=Date.parse(p.timestamp), key=id+':'+p.timestamp;
   if(!number(p.value)||!Number.isFinite(t)||t<Date.parse(start)||t>now||points.has(key))return null;
   points.add(key);mb+=p.value*f;through=Math.max(through,t);
  }
 }
 if(found.size!==resources.length)return null;
 return {mb,through:new Date(through).toISOString()};
}
export function makeUsageSnapshot(neon: any, endpoints: any, services: any, bandwidth: unknown, errors: string[], now=Date.now()): UsageSnapshot {
 const period=monthPeriod(now), checkedAt=new Date(now).toISOString();
 const np=neon?.project, valid=validPeriod(np?.consumption_period_start,np?.consumption_period_end,now);
 const neonPeriod=valid?{periodStart:np.consumption_period_start,periodEnd:np.consumption_period_end}:period;
 const common={confidence:'low' as const,dataThrough:null};
 const ns=Array.isArray(endpoints?.endpoints)?endpoints.endpoints:null;
 let compute:number|null=null;
 if(valid&&ns?.length) { const values=ns.map((e:any)=>{ const h=elapsedHours(e.created_at,neonPeriod.periodStart,now); return h!==null&&number(e.autoscaling_limit_max_cu)&&e.autoscaling_limit_max_cu>0?h*e.autoscaling_limit_max_cu:null; }); if(values.every((x:any)=>x!==null))compute=values.reduce((a:number,b:number|null)=>a+(b??0),0); }
 const rs=Array.isArray(services)?services.map((x:any)=>x.service):null;
 const free=rs?.filter((s:any)=>s.type==='web_service'&&s.serviceDetails?.plan==='free');
 let hours:number|null=null;
 if(free?.length) {const values=free.map((s:any)=>elapsedHours(s.createdAt,period.periodStart,now));if(values.every((x:any)=>x!==null))hours=values.reduce((a:number,b:number|null)=>a+(b??0),0);}
 const ids=rs?.map((s:any)=>s.id)??[]; const bw=bandwidthEstimate(bandwidth,ids,period.periodStart,now);
 return {checkedAt,refreshAfter:new Date(now+15*60000).toISOString(),errors,meters:[
  meter({...common,...neonPeriod,id:'neon-transfer',provider:'Neon',title:'Data transfer',used:valid&&number(np.data_transfer_bytes)?np.data_transfer_bytes/1e9:null,limit:5,unit:'GB',kind:valid&&number(np.data_transfer_bytes)?'reported':'unavailable',note:'Provider-reported reading may be delayed. Its update time is not supplied; checked time is not data freshness. Remaining is relative to this reading, not a live balance.',source:'Neon project API; selected project; assumed Free plan'}),
  meter({...common,...neonPeriod,id:'neon-compute',provider:'Neon',title:'Compute allowance',used:compute,limit:100,unit:'CU-hours',kind:compute===null?'unavailable':'estimate',note:'High-side planning estimate: each current endpoint has run at its current maximum size since creation or month start. Includes idle time; excludes deleted endpoints and earlier sizing. Remaining is a model, not a billing balance. Raw legacy compute seconds are not treated as CU-hours.',source:'Current endpoint age × configured maximum CU; assumed Free plan'}),
  meter({...common,...period,id:'render-bandwidth',provider:'Render',title:'Outbound bandwidth',used:bw?bw.mb/1000:null,limit:5,unit:'GB',kind:bw?'estimate':'unavailable',confidence:'medium',dataThrough:bw?.through??null,note:'Hourly provider totals for current selected-workspace services, interpreted as decimal MB. Latest hour may be partial; deleted services and other workspace resources may be absent. Billing dashboard remains authoritative.',source:'Render bandwidth metrics; current workspace services; assumed Hobby allowance'}),
  meter({...common,...period,id:'render-hours',provider:'Render',title:'Free running hours',used:hours,limit:750,unit:'hours',kind:hours===null?'unavailable':'estimate',note:'High-side estimate for current free web services: creation-to-now time, including sleep. Deleted services and plan changes are absent. Remaining is a model, not guaranteed workspace credit.',source:'Current Free service ages; shared calendar-month allowance'})
 ]};
}

// Planning coefficients, not provider billing meters. Decimal MB throughout.
export const USAGE_PLANNING = { rideHourMB: 1.448, apkMB: 63.9, changedBackupMB: 38.47, renderAllowanceGB: 5 } as const;
export function planRenderUsage(input: { rideHours: number; apkDownloads: number; changedBackups: number }, baselineGB: number | null) {
 if(!number(input.rideHours)||input.rideHours>100000||!Number.isSafeInteger(input.apkDownloads)||input.apkDownloads<0||input.apkDownloads>100000||!Number.isSafeInteger(input.changedBackups)||input.changedBackups<0||input.changedBackups>100000)return null;
 const rideMB=input.rideHours*USAGE_PLANNING.rideHourMB;
 const apkMB=input.apkDownloads*USAGE_PLANNING.apkMB;
 const backupMB=input.changedBackups*USAGE_PLANNING.changedBackupMB;
 const additionalGB=(rideMB+apkMB+backupMB)/1000;
 const baseline=number(baselineGB)?baselineGB:null;
 const projectedGB=baseline===null?null:baseline+additionalGB;
 return {rideMB,apkMB,backupMB,additionalGB,scenarioPercent:additionalGB/USAGE_PLANNING.renderAllowanceGB*100,baselineGB:baseline,projectedGB,projectedPercent:projectedGB===null?null:projectedGB/USAGE_PLANNING.renderAllowanceGB*100,remainingGB:projectedGB===null?null:Math.max(0,USAGE_PLANNING.renderAllowanceGB-projectedGB)};
}
