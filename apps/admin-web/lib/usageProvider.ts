import { makeUsageSnapshot, monthPeriod, type UsageSnapshot } from './usageModel';
let cache: { until: number; value: UsageSnapshot } | undefined;
let inflight: Promise<UsageSnapshot> | undefined;
async function read(url: string, key: string | undefined, label: string, errors: string[]) {
 if(!key) {errors.push(label+': connection not configured'); return null;}
 try { const response=await fetch(url,{headers:{Authorization:'Bearer '+key,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok){await response.body?.cancel();errors.push(label+': provider returned HTTP '+response.status);return null;}return await response.json(); }
 catch { errors.push(label+': provider reading unavailable'); return null; }
}
async function collect(): Promise<UsageSnapshot> {
 const now=Date.now(), errors:string[]=[];
 const project=process.env.JR_USAGE_NEON_PROJECT_ID, owner=process.env.JR_USAGE_RENDER_OWNER_ID;
 const nk=process.env.JR_USAGE_NEON_API_KEY,rk=process.env.JR_USAGE_RENDER_API_KEY;
 const [neon,endpoints,services]=await Promise.all([
  project?read('https://console.neon.tech/api/v2/projects/'+encodeURIComponent(project),nk,'Neon project',errors):null,
  project?read('https://console.neon.tech/api/v2/projects/'+encodeURIComponent(project)+'/endpoints',nk,'Neon endpoints',errors):null,
  owner?read('https://api.render.com/v1/services?limit=100&ownerId='+encodeURIComponent(owner),rk,'Render services',errors):null
 ]);
 if(!project)errors.push('Neon: project not configured');if(!owner)errors.push('Render: workspace not configured');
 // Fail closed on a full page: it may omit services. Never label a truncated list complete.
 const scoped=Array.isArray(services)&&services.length<100&&services.every((x:any)=>x?.service?.ownerId===owner)?services:null;
 if(services&&!scoped)errors.push('Render: service scope incomplete; totals unavailable');
 const q=new URLSearchParams({startTime:monthPeriod(now).periodStart,endTime:new Date(now).toISOString()});
 for(const x of scoped??[])q.append('resource',x.service.id);
 const bandwidth=scoped?.length?await read('https://api.render.com/v1/metrics/bandwidth?'+q.toString(),rk,'Render bandwidth',errors):null;
 return makeUsageSnapshot(neon,endpoints,scoped,bandwidth,errors,now);
}
export async function getUsageSnapshot() {
 if(cache&&cache.until>Date.now())return cache.value;
 if(!inflight)inflight=collect().then(value=>{cache={value,until:Date.now()+15*60000};return value;}).finally(()=>{inflight=undefined;});
 return inflight;
}
