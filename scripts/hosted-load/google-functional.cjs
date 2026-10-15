/* Independent functional check. A failed capacity inventory never becomes capacity certification. */
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {validateConfig,validateRuntime,expectedBuildForOrigin}=require('./guards.cjs');
const {loadDependency,createTransport}=require('./transport.cjs');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function validateFunctional(c,source){
 validateConfig(c);assert.equal(c.rides,10);assert.equal(c.mapsEnabled,true);assert.equal(c.functionalOnly,true);assert.equal(c.capacityCertification,false);assert.equal(c.providerWhitelistConfirmed,true);
 assert.match(source.runId,/^jr-hosted-load-[0-9]+-[a-f0-9]{8}$/);assert.ok(['PASS','FAIL'].includes(source.verdict));
 for(const key of ['environment','databaseName','apiOrigin','socketOrigin'])assert.equal(source.scope[key],key==='environment'?c.environmentId:c[key]);
 assert.equal(source.scope.rides,50,'Source inventory must be the preserved50ride run');assert.match(source.scope.build,/^[a-f0-9]{40}$/);assert.equal(source.fixtureIds.length,50);
 for(const field of ['id','userId','driverId']){const values=source.fixtureIds.map(r=>r[field]);values.forEach(v=>assert.match(v,UUID));assert.equal(new Set(values).size,50,'Unique fixture tuples required');}
 return {kind:'FUNCTIONAL_ONLY',capacityCertification:false,sourceRunId:source.runId,sourceCapacityVerdict:source.verdict,sourceBuild:source.scope.build,targetBuild:c.expectedBuild,socketBuild:c.expectedSocketBuild??c.expectedBuild,selectedRides:10,proxyHttpCap:20};
}
function assertOwned(rows,source){
 assert.equal(rows.length,10);const byId=new Map(rows.map(r=>[r.id,r]));assert.equal(byId.size,10);
 for(const r of source.fixtureIds.slice(0,10)){const db=byId.get(r.id);assert.ok(db);assert.equal(db.user_id,r.userId);assert.equal(db.driver_id,r.driverId);assert.equal(db.pickup_address,source.runId);assert.equal(db.user_name,source.runId);assert.equal(db.driver_name,source.runId);assert.equal(db.user_demo,true);assert.equal(db.driver_demo,true);assert.equal(db.is_demo,true);assert.equal(db.user_disabled,false);assert.equal(db.driver_disabled,false);assert.equal(db.user_push,null);assert.equal(db.driver_push,null);assert.ok(['CANCELLED','COMPLETED'].includes(db.status),'Only inactive source fixtures may be activated');}
}
function assertGoogle(kind,data){if(kind==='landmarks'){assert.equal(data.provider,'google');assert.ok(Array.isArray(data.landmarks)&&data.landmarks.length>0);for(const item of data.landmarks){for(const key of ['id','name','label'])assert.ok(typeof item[key]==='string'&&item[key].trim().length>0);assert.ok(Number.isFinite(item.distanceMeters)&&item.distanceMeters>=0);}}else{assert.equal(data.available,true);assert.equal(data.source,'google');assert.ok(Number.isFinite(data.distanceKm)&&data.distanceKm>=0);assert.ok(Number.isFinite(data.durationMin)&&data.durationMin>=0);assert.ok(Array.isArray(data.path)&&data.path.length>1);for(const point of data.path){assert.ok(Array.isArray(point)&&point.length===2);assert.ok(Number.isFinite(point[0])&&Math.abs(point[0])<=90);assert.ok(Number.isFinite(point[1])&&Math.abs(point[1])<=180);}}}
function stopGuard(events=process){let stopped=false;const stop=()=>{stopped=true;};events.once('SIGINT',stop);events.once('SIGTERM',stop);return{check(){assert.equal(stopped,false,'Functional test interrupted');},close(){events.removeListener('SIGINT',stop);events.removeListener('SIGTERM',stop);}};}
async function closeTransport(transport){let timer;try{await Promise.race([transport.close(),new Promise((_,reject)=>{timer=setTimeout(()=>{try{Promise.resolve(transport.dispatcher?.destroy()).catch(()=>reject(new Error('Transport shutdown failed')));}catch{reject(new Error('Transport shutdown failed'));}reject(new Error('Transport shutdown deadline'));},5000);})]);}finally{clearTimeout(timer);}}
async function execute(c,source,e,reportPath,deps={}){
 const scope=validateFunctional(c,source);validateRuntime(c,e);assert.equal(e.JR_GOOGLE_FUNCTIONAL_CONFIRM,'10-landmarks-10-live-eta');assert.ok(!fs.existsSync(reportPath),'Never overwrite evidence');
 const postgres=deps.postgres??loadDependency('postgres',require('node:path').resolve(__dirname,'../../packages/db/node_modules/postgres'));
 const sql=postgres(e.JR_HOSTED_LOAD_DATABASE_URL,{max:3,ssl:{rejectUnauthorized:true},connect_timeout:15,connection:{statement_timeout:15000}}),transport=(deps.createTransport??createTransport)();const fetcher=deps.fetch??fetch;
 const selected=source.fixtureIds.slice(0,10);
 const ids=selected.map(r=>r.id),driverIds=selected.map(r=>r.driverId);
 const report={scope,startedAt:new Date().toISOString(),verdict:'FUNCTIONAL_FAIL',capacityCertification:false,proxyHttpCalls:0,landmarks:0,eta:0,errors:[],cleanup:'not_required',billingCaveat:'20 proxy HTTP calls do not imply 20 billable provider requests; fan-out, cache, retries and SKUs differ'};
 let activated=false,saved=[];const stop=stopGuard();
 const sign=(sub,role)=>{const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),body=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub,role,exp:Math.floor(Date.now()/1000)+900});return body+'.'+crypto.createHmac('sha256',e.JR_HOSTED_LOAD_JWT_SECRET).update(body).digest('base64url');};
 async function http(path,token,body){stop.check();const r=await fetcher(c.apiOrigin+path,{method:body===undefined?'GET':'POST',redirect:'error',dispatcher:transport.dispatcher,signal:AbortSignal.timeout(45000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();assert.equal(r.status,200,'Unexpected HTTP status');return JSON.parse(text);}
 try{
  for(const origin of [c.apiOrigin,c.socketOrigin]){const r=await fetcher(origin+'/health',{redirect:'error',signal:AbortSignal.timeout(60000)});assert.equal(r.status,200);assert.equal((await r.json()).build,expectedBuildForOrigin(c,origin));}
  const [db]=await sql`SELECT current_database() AS name`;assert.equal(db.name,c.databaseName);
  const markers=await sql`SELECT environment_id,api_origin,socket_origin,outbound_notifications_disabled FROM jr_load_environment`;assert.equal(markers.length,1);assert.deepEqual(markers[0],{environment_id:c.environmentId,api_origin:c.apiOrigin,socket_origin:c.socketOrigin,outbound_notifications_disabled:true});
  const [domain]=await sql`SELECT (SELECT count(*)::int FROM bookings WHERE status IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')) active,(SELECT count(*)::int FROM users WHERE NOT is_demo OR push_token IS NOT NULL) users,(SELECT count(*)::int FROM drivers WHERE NOT is_demo OR push_token IS NOT NULL) drivers`;assert.deepEqual(domain,{active:0,users:0,drivers:0});
  await sql.begin(async tx=>{
   saved=await tx`SELECT b.id,b.user_id,b.driver_id,b.pickup_address,b.status,b.completed_at,b.cancelled_at,b.is_demo,u.name user_name,d.name driver_name,u.is_demo user_demo,d.is_demo driver_demo,u.disabled user_disabled,d.disabled driver_disabled,u.push_token user_push,d.push_token driver_push FROM bookings b JOIN users u ON u.id=b.user_id JOIN drivers d ON d.id=b.driver_id WHERE b.id=ANY(${ids}::uuid[]) FOR UPDATE OF b,d,u`;
   assertOwned(saved,source);
   const bound=await http('/api/v1/bookings/'+source.fixtureIds[0].id,sign(source.fixtureIds[0].userId,'user'));assert.equal(bound.booking.pickupAddress,source.runId);stop.check();activated=true;report.cleanup='required';
   const updated=await tx`UPDATE bookings SET status='PICKED_UP',completed_at=NULL,cancelled_at=NULL WHERE id=ANY(${ids}::uuid[]) RETURNING id`;assert.equal(updated.length,10);
  });
  const fresh=await Promise.allSettled(selected.map(async(r,i)=>{const d=await http('/api/v1/driver/location-batch',sign(r.driverId,'driver'),{points:[{bookingId:r.id,lat:28.4771+i*.00002,lng:79.4381,ts:Date.now()}],partial:true});assert.equal(d.accepted,1);assert.equal(d.rejected.length,0);}));assert.ok(fresh.every(r=>r.status==='fulfilled'),'Fresh GPS setup failed');
  await Promise.all(selected.map(async(r,i)=>Promise.all([['landmarks','/api/v1/places/landmarks?lat='+(28.48127+i*.0002)+'&lng=79.443282&language=en'],['eta','/api/v1/bookings/'+r.id+'/live-eta']].map(async([kind,path])=>{try{assert.ok(++report.proxyHttpCalls<=20);assertGoogle(kind,await http(path,sign(r.userId,'user')));report[kind]++;}catch{report.errors.push({kind,index:i,error:'Google proxy validation failed'});}}))));
  stop.check();assert.equal(report.proxyHttpCalls,20);assert.equal(report.errors.length,0);report.verdict='FUNCTIONAL_PASS';
 }catch{report.failure='Functional guard, setup or provider validation failed';}
 finally{
  if(activated)try{await sql.begin(async tx=>{for(const row of saved){const updated=await tx`UPDATE bookings SET status=${row.status},completed_at=${row.completed_at},cancelled_at=${row.cancelled_at} WHERE id=${row.id} AND user_id=${row.user_id} AND driver_id=${row.driver_id} AND is_demo AND pickup_address=${source.runId} RETURNING id`;assert.equal(updated.length,1);}const drivers=await tx`UPDATE drivers SET status='OFFLINE' WHERE id=ANY(${driverIds}::uuid[]) AND name=${source.runId} AND is_demo RETURNING id`;assert.equal(drivers.length,10);const [active]=await tx`SELECT count(*)::int n FROM bookings WHERE id=ANY(${ids}::uuid[]) AND status IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')`;assert.equal(active.n,0);});report.cleanup='restored_inactive';}catch{report.cleanup='FAILED';report.verdict='FUNCTIONAL_FAIL';}
  const closed=await Promise.allSettled([sql.end({timeout:5}),closeTransport(transport)]);if(closed.some(r=>r.status==='rejected')){report.verdict='FUNCTIONAL_FAIL';report.failure='Resource shutdown failed';}stop.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
 }
 return report;
}
module.exports={validateFunctional,assertOwned,assertGoogle,stopGuard,execute};
if(require.main===module){const[c,s,r]=process.argv.slice(2);assert.ok(c&&s&&r,'Usage: google-functional.cjs config.json source-report.json new-report.json');execute(JSON.parse(fs.readFileSync(c)),JSON.parse(fs.readFileSync(s)),process.env,r).then(report=>{console.log(JSON.stringify({verdict:report.verdict,capacityCertification:false,proxyHttpCalls:report.proxyHttpCalls,landmarks:report.landmarks,eta:report.eta,cleanup:report.cleanup}));if(report.verdict!=='FUNCTIONAL_PASS')process.exitCode=1;}).catch(()=>{console.error('Functional check refused before execution');process.exitCode=1;});}
