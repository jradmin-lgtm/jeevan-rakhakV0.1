const assert=require('node:assert/strict');
const {API_BUILD,SOURCE_SHA256,createQueue,fileStorage}=require('./production-queue.cjs');
function validateClientScenario(c){assert.equal(c.scenario,'PRODUCTION_CLIENT_RESILIENCE');assert.equal(c.rides,10);assert.equal(c.cycles,360);assert.equal(c.expectedBuild,API_BUILD);assert.equal(c.mapsEnabled,false);assert.equal(c.httpP95Ms,2000);assert.equal(c.gpsP95Ms,1500);assert.equal(c.deliveryTimeoutMs,15000);assert.equal(c.clientRecoveryDeadlineMs,60000);assert.equal(c.controlled502Confirmed,true);}
function workloadPlan(c){validateClientScenario(c);return{scenario:c.scenario,strictCapacityCertification:false,queueSourceSHA256:SOURCE_SHA256,userPollMs:5000,driverPollMs:12000,socketFixMs:5000,gpsSampleEveryFixes:3,foregroundFlushMs:15000,httpRequestTimeoutMs:45000,recoveryDeadlineMs:60000,nominalUserPolls:3600,nominalDriverPolls:1500,nominalSampledGpsPoints:1210,note:'First GPS fix is queued; then every third fix. Concurrent queue flushes share one upload. Batch HTTP count can differ after recovery; raw failures are never erased.'};}
function naturalFault(error){if(error?.status!=null)return[408,429,500,502,503,504].includes(error.status);return['AbortError','TimeoutError'].includes(error?.name)||error?.message==='fetch failed'||['ECONNRESET','ETIMEDOUT','EAI_AGAIN','ENETUNREACH','ECONNREFUSED'].includes(error?.cause?.code);}
async function runClientWorkload({c,rides,http,emit,point,check,sleep,drained,uploadedTimestamps,report,directory,sql,stage,clock={now:()=>performance.now(),wall:()=>Date.now()},log=console.log}){
 validateClientScenario(c);const now=clock.now,wall=clock.wall;const storage=fileStorage(directory),fault={armed:false,injected:0};
 const row=report.client={...workloadPlan(c),rawHttpErrors:[],recoveredHttpEpisodes:[],queueChecks:0,maxPendingPoints:0,maxPendingAgeMs:0,unresolvedPoints:null,controlledFault:{injectedStatus:502,injectedAttempts:0,includedInNaturalRawErrors:false,verdict:'NOT_RUN'}};
 let phase='controlled';const queues=new Map();
 const queueFor=r=>createQueue({owner:r.driverId,storage,send:async(url,options)=>{assert.equal(url,'/api/v1/driver/location-batch');if(fault.armed&&r===rides[0]){fault.armed=false;fault.injected++;row.controlledFault.injectedAttempts=fault.injected;row.controlledFault.verdict='INJECTED_PENDING_RECOVERY';const error=new Error('Controlled502 retained explicitly');error.status=502;error.injected=true;throw error;}const at=now();const data=await http(phase==='steady'?'live-gps-batch':'controlled-queue-http','/api/v1/driver/location-batch',r.dt,options.body,45000);if(phase==='controlled')assert.ok(now()-at<=2000,'Controlled ACK exceeded unchanged HTTP budget');for(const p of options.body.points)assert.ok(wall()-p.ts<=60000,'Acknowledged GPS point exceeded60s recovery bound');return data;}});
 rides.forEach(r=>queues.set(r.id,queueFor(r)));
 await stage('Separate controlled502 queue recovery using unchanged production client',async()=>{
  const r=rides[0],p=point(r,9000);const count=async()=>{const[v]=await sql`SELECT count(*)::int n FROM driver_locations WHERE booking_id=${r.id} AND recorded_at=${new Date(p.ts)}`;return v.n;};assert.equal(await count(),0);
  let q=queues.get(r.id);fault.armed=true;const at=now();await q.queueLocation(p);uploadedTimestamps.add(p.bookingId+':'+p.ts);
  await assert.rejects(q.flushLocationQueue(),e=>e.injected===true&&e.status===502);assert.equal((await q.locationQueueStatus()).pending,1);assert.equal(await count(),0);
  q=queueFor(r);queues.set(r.id,q);assert.equal((await q.locationQueueStatus()).pending,1);assert.equal(storage.points(r.driverId)[0].ts,p.ts);
  await sleep(15000);check();await q.flushLocationQueue();const recoveryMs=Math.round(now()-at);assert.ok(recoveryMs<=17000,'Controlled immediate502 did not recover at next15s sync plus2s ACK target');assert.equal((await q.locationQueueStatus()).pending,0);assert.equal(await count(),1);
  await q.queueLocation(p);await q.flushLocationQueue();assert.equal(await count(),1);assert.equal(fault.injected,1);
  row.controlledFault={injectedStatus:502,injectedAttempts:1,includedInNaturalRawErrors:false,pendingAfterFailure:1,pendingAfterRestart:1,recoveryMs,persistedRowsAfterDuplicateReplay:1,verdict:'RECOVERY_PASS'};
 });
 phase='steady';const busy=new Map(),inflight=new Set(),episodes=new Map();let fatal=null;
 const recovered=key=>{const started=episodes.get(key);if(started!==undefined){const delay=now()-started;assert.ok(delay<=60000,'Client recovery exceeded60s');row.recoveredHttpEpisodes.push({kind:key.split(':')[0],delayMs:Math.round(delay)});episodes.delete(key);}};
 const launch=(key,fn)=>{if(busy.has(key))return;const launchedAt=now();const op=(async()=>{try{await fn();recovered(key);}catch(error){row.rawHttpErrors.push({kind:key.split(':')[0],status:error?.status??null});if(!episodes.has(key))episodes.set(key,launchedAt);if(!naturalFault(error))fatal=new Error('Non-transient client operation failed');}})();busy.set(key,op);inflight.add(op);op.finally(()=>{busy.delete(key);inflight.delete(op);});};
 const flush=r=>launch('queue:'+r.id,()=>queues.get(r.id).flushLocationQueue());
 await stage('10 app-matched rides for30minutes with raw errors and recovery tracked separately',async()=>{
  const start=now();let gpsTick=0;
  try{for(let second=0;second<1800;second++){
   check();if(fatal)throw fatal;
   if(second%5===0){gpsTick++;for(const r of rides){const p=point(r,gpsTick);emit(r,p);if(gpsTick===1||gpsTick%3===0){await queues.get(r.id).queueLocation(p);uploadedTimestamps.add(p.bookingId+':'+p.ts);flush(r);}launch('user-poll:'+r.id,async()=>{const data=await http('booking-poll','/api/v1/bookings/'+r.id,r.ut,undefined,45000);assert.equal(data.booking.id,r.id);assert.equal(data.booking.driverId,r.driverId);});}}
   if(second%12===0)for(const r of rides)launch('driver-poll:'+r.id,async()=>{const data=await http('booking-poll-driver','/api/v1/bookings/'+r.id,r.dt,undefined,45000);assert.equal(data.booking.id,r.id);assert.equal(data.booking.driverId,r.driverId);});
   if(second%15===0)rides.forEach(flush);
   let pending=0,age=0;for(const r of rides){const points=storage.points(r.driverId);pending+=points.length;for(const p of points)age=Math.max(age,wall()-p.ts);assert.ok(queues.get(r.id).storageErrors()===0,'Production queue storage operation failed');}
   row.queueChecks++;row.maxPendingPoints=Math.max(row.maxPendingPoints,pending);row.maxPendingAgeMs=Math.max(row.maxPendingAgeMs,age);assert.ok(age<=60000,'GPS points unresolved beyond declared60s recovery bound');for(const started of episodes.values())assert.ok(now()-started<=60000,'Poll or queue operation unresolved beyond60s');
   if(second%60===59)log(JSON.stringify({stage:'client-steady',seconds:second+1,totalSeconds:1800,pendingGpsPoints:pending,pendingSocketGps:report.gps.expected-report.gps.received,rawHttpErrors:row.rawHttpErrors.length}));
   await sleep(Math.max(0,start+(second+1)*1000-now()));
  }
  }finally{await Promise.allSettled([...inflight]);}
  if(fatal)throw fatal;for(const r of rides){await queues.get(r.id).flushLocationQueue();recovered('queue:'+r.id);}for(const key of [...episodes.keys()]){const[kind,id]=key.split(':'),r=rides.find(x=>x.id===id);assert.ok(r&&['user-poll','driver-poll'].includes(kind));const data=await http(kind==='user-poll'?'booking-poll':'booking-poll-driver','/api/v1/bookings/'+r.id,kind==='user-poll'?r.ut:r.dt,undefined,45000);assert.equal(data.booking.id,r.id);assert.equal(data.booking.driverId,r.driverId);recovered(key);}await drained();
  row.unresolvedPoints=rides.reduce((n,r)=>n+storage.points(r.driverId).length,0);assert.equal(row.unresolvedPoints,0);for(const r of rides)assert.equal((await queues.get(r.id).locationQueueStatus()).pending,0);
  assert.equal(episodes.size,0,'Client poll or queue error did not recover');row.steadyDurationMs=Math.round(now()-start);
 });
}
module.exports={validateClientScenario,workloadPlan,naturalFault,runClientWorkload};
