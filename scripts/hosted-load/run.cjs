/* Hosted-only, isolated capacity exercise. Never remove the local runner's guards. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const {validateConfig, validateRuntime, percentile, validateAck, expectedBuildForOrigin} = require('./guards.cjs');
const {loadDependency, createTransport} = require('./transport.cjs');
const {measureDatabaseRoundTrips} = require('./database-probe.cjs');
const {failureResponse} = require('./failure-response.cjs');
const root = path.resolve(__dirname, '../..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function parallel(items, limit, fn) {
  let cursor = 0; const errors = [];
  await Promise.all(Array.from({length:Math.min(limit,items.length)}, async()=>{
    for (;;) { const i=cursor++; if(i>=items.length) return; try { await fn(items[i],i); } catch(error) { errors.push(error); } }
  }));
  if(errors.length) throw new Error(`${errors.length} operation(s) failed; first: ${errors[0].message}`);
}
function summary(xs) { return {count:xs.length,p50:percentile(xs,.5),p95:percentile(xs,.95),p99:percentile(xs,.99),max:xs.length?Math.round(Math.max(...xs)*10)/10:null}; }
function plan(c) {
  validateConfig(c);
  return {environment:c.environmentId,apiOrigin:c.apiOrigin,socketOrigin:c.socketOrigin,databaseName:c.databaseName,build:c.expectedBuild,socketBuild:c.expectedSocketBuild??c.expectedBuild,
    rides:50,users:50,drivers:50,sockets:100,steadySeconds:c.cycles*5,steadyHttpRequests:c.cycles*100,
    offlinePoints:1000,offlineReplayRequests:100,databaseProbeQueries:111,reconnectUsers:25,mapHttpRequestCap:c.maxMapHttpCalls,
    payloadMeasurement:'Decoded UTF-8 JSON response and request-body bytes only; excludes headers/TLS/compression and is not billed network transfer',
    excluded:['Real push/SMS/email','Booking creation and nearest-driver dispatch selection (fixtures pre-offered)','Phone map renderers and APK UI','Physical Android queue storage','Billing/quota guarantees','Login/OTP authentication provider']};
}
async function main() {
  const [mode, configFile, reportFile] = process.argv.slice(2);
  assert.ok(['--plan','--run'].includes(mode) && configFile, 'Usage: node scripts/hosted-load/run.cjs --plan|--run config.json [report.json]');
  const c=JSON.parse(fs.readFileSync(configFile,'utf8'));
  const scope=plan(c);
  if(mode==='--plan') { console.log(JSON.stringify(scope,null,2)); return; }
  assert.ok(reportFile, 'Report filename required');
  assert.ok(!fs.existsSync(reportFile), 'Do not overwrite previous evidence');
  validateRuntime(c,process.env);
  const postgres=loadDependency('postgres', root+'/packages/db/node_modules/postgres');
  const {io}=loadDependency('socket.io-client', root+'/apps/driver-app/node_modules/socket.io-client');
  const transport=createTransport();
  const sql=postgres(process.env.JR_HOSTED_LOAD_DATABASE_URL,{max:4,connect_timeout:15,idle_timeout:20,ssl:{rejectUnauthorized:true},connection:{statement_timeout:15000,application_name:'jr-hosted-load'}});
  const runId='jr-hosted-load-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex');
  const rides=Array.from({length:50},(_,index)=>({index,id:crypto.randomUUID(),userId:crypto.randomUUID(),driverId:crypto.randomUUID()}));
  const report={schemaVersion:1,runId,scope,startedAt:new Date().toISOString(),verdict:'NOT_RUN',stages:[],http:{},failureResponses:[],gps:{expected:0,received:0,duplicates:0,crossRide:0,unexpected:0},socketErrors:0,cleanup:'not_required',maps:{enabled:c.mapsEnabled,httpCalls:0,available:0,unavailable:0},limitations:scope.excluded};
  const sockets=[],pending=new Map(),seen=new Set(),uploadedTimestamps=new Set(),gpsTimes=[],connectTimes=[];
  const deadline=Date.now()+c.cycles*5000+15*60_000;
  let seeded=false,stopping=false;
  const stop=()=>{stopping=true;}; process.once('SIGINT',stop);process.once('SIGTERM',stop);
  const check=()=>assert.ok(!stopping && Date.now()<deadline,'Run interrupted or time budget exceeded');
  const safe=message=>{
    let text=String(message);
    for(const value of [process.env.JR_HOSTED_LOAD_DATABASE_URL,process.env.JR_HOSTED_LOAD_JWT_SECRET]) if(value)text=text.split(value).join('[redacted]');
    return text.replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted JWT]').slice(0,1500);
  };
  function sign(sub,role) {
    const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const body=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub,role,exp:Math.floor(deadline/1000)+600});
    return body+'.'+crypto.createHmac('sha256',process.env.JR_HOSTED_LOAD_JWT_SECRET).update(body).digest('base64url');
  }
  async function http(label,origin,url,token,body,statuses=[200],timeout=15000) {
    check(); const at=performance.now(); const metric=report.http[label]??={times:[],statuses:{},unexpected:0,requestBodyUtf8Bytes:0,decodedResponseUtf8Bytes:0};
    const requestBody=body===undefined?undefined:JSON.stringify(body);
    metric.requestBodyUtf8Bytes+=requestBody===undefined?0:Buffer.byteLength(requestBody);
    try {
      const response=await fetch(origin+url,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(timeout),dispatcher:transport.dispatcher,headers:{...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json'},...(requestBody===undefined?{}:{body:requestBody})});
      metric.statuses[response.status]=(metric.statuses[response.status]||0)+1;
      const text=await response.text();metric.decodedResponseUtf8Bytes+=Buffer.byteLength(text);
      if(!statuses.includes(response.status)) { metric.unexpected++;if(report.failureResponses.length<5)report.failureResponses.push(failureResponse(label,response.status,response.headers,text,safe)); throw new Error(`${label}: HTTP ${response.status}`); }
      return JSON.parse(text);
    } catch(error) { if(!String(error.message).startsWith(label+': HTTP')) {metric.unexpected++;metric.statuses.transportOrJson=(metric.statuses.transportOrJson||0)+1;} throw error; }
    finally {metric.times.push(performance.now()-at);}
  }
  const api=(label,url,token,body,statuses)=>http(label,c.apiOrigin,url,token,body,statuses);
  async function stage(name,fn) {
    check();const row={name,startedAt:new Date().toISOString(),status:'running'};report.stages.push(row);const at=performance.now();
    try {await fn();row.status='pass';}catch(error){row.status='fail';row.error=safe(error.message);throw error;}finally{row.durationMs=Math.round(performance.now()-at);console.log(JSON.stringify({stage:name,status:row.status,durationMs:row.durationMs}));}
  }
  async function connect(ride,role) {
    const socket=io(c.socketOrigin,{auth:{token:role==='user'?ride.ut:ride.dt},transports:['websocket'],reconnection:false,autoConnect:false,timeout:15000});sockets.push(socket);
    socket.on('connect_error',()=>{report.socketErrors++;});
    socket.on('session:error',()=>{report.socketErrors++;});
    socket.on('connect',()=>socket.emit('booking:subscribe',{bookingId:ride.id}));
    if(role==='user')socket.on('driver:location:update',point=>{
      if(point.bookingId!==ride.id){report.gps.crossRide++;return;}
      const key=point.bookingId+':'+point.ts;
      if(seen.has(key)){report.gps.duplicates++;return;}
      if(!pending.has(key)){report.gps.unexpected++;return;}
      seen.add(key);gpsTimes.push(performance.now()-pending.get(key));pending.delete(key);report.gps.received++;
    });
    await reconnect(socket);return socket;
  }
  async function reconnect(socket) {
    const at=performance.now();
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>done(new Error('Socket connect deadline exceeded')),16000);
      function done(error){clearTimeout(timeout);socket.off('connect',ok);socket.off('connect_error',fail);error?reject(error):resolve();}
      const ok=()=>done(),fail=()=>done(new Error('Socket connect failed'));
      socket.once('connect',ok);socket.once('connect_error',fail);socket.connect();
    });connectTimes.push(performance.now()-at);
  }
  function point(ride,sequence,ts=Date.now()) {return {bookingId:ride.id,lat:28.4771+ride.index*.00002+sequence*.000001,lng:79.4381,ts};}
  function emit(ride,p) {const key=p.bookingId+':'+p.ts;assert.ok(!pending.has(key)&&!seen.has(key),'Unique GPS probe required');pending.set(key,performance.now());report.gps.expected++;ride.ds.emit('driver:location',p);}
  async function drained() {const until=Date.now()+c.deliveryTimeoutMs;while(pending.size&&Date.now()<until){check();await sleep(100);}assert.equal(pending.size,0,'Missing GPS deliveries after bounded observation');}
  try {
    await stage('Verify hosted build, isolation marker and empty test domain',async()=>{
      assert.ok(!c.apiOrigin.endsWith('.invalid')&&!c.socketOrigin.endsWith('.invalid'),'Replace example hosts');
      for(const origin of [c.apiOrigin,c.socketOrigin]) {const h=await http('health',origin,'/health',null,undefined,[200],60000);assert.equal(h.build,expectedBuildForOrigin(c,origin),'Hosted build mismatch');}
      await http('db-health',c.apiOrigin,'/health/db',null,undefined,[200],30000);
      const [db]=await sql`SELECT current_database() AS name`;assert.equal(db.name,c.databaseName);
      const marker=await sql`SELECT environment_id,api_origin,socket_origin,outbound_notifications_disabled FROM jr_load_environment`;
      assert.equal(marker.length,1);assert.equal(marker[0].environment_id,c.environmentId);assert.equal(marker[0].api_origin,c.apiOrigin);assert.equal(marker[0].socket_origin,c.socketOrigin);assert.equal(marker[0].outbound_notifications_disabled,true);
      const [existing]=await sql`SELECT (SELECT count(*) FROM users WHERE NOT is_demo OR phone NOT LIKE 'jr-hosted-load-%' OR push_token IS NOT NULL)::int AS users,(SELECT count(*) FROM drivers WHERE NOT is_demo OR phone NOT LIKE 'jr-hosted-load-%' OR push_token IS NOT NULL)::int AS drivers,(SELECT count(*) FROM bookings WHERE NOT is_demo)::int AS bookings`;
      assert.deepEqual(existing,{users:0,drivers:0,bookings:0},'Database contains non-load identities or push tokens');
      const [active]=await sql`SELECT count(*)::int AS n FROM bookings WHERE status IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')`;assert.equal(active.n,0,'Prior active test must be resolved first');
      report.databaseRoundTrips=await measureDatabaseRoundTrips(postgres,process.env.JR_HOSTED_LOAD_DATABASE_URL);
    });
    await stage('Seed 50 isolated users, drivers and pre-offered requests',async()=>{
      const dispatchAt=new Date(Date.now()-1000);
      await sql.begin(async tx=>{
        await tx`INSERT INTO users ${tx(rides.map(r=>({id:r.userId,phone:runId+'u'+r.index,name:runId,is_demo:true})))}`;
        await tx`INSERT INTO drivers ${tx(rides.map(r=>({id:r.driverId,phone:runId+'d'+r.index,name:runId,is_demo:true,kyc_verified:true,status:'AVAILABLE',last_lat:28.4771,last_lng:79.4381,last_seen_at:new Date()})))}`;
        await tx`INSERT INTO bookings ${tx(rides.map(r=>({id:r.id,user_id:r.userId,status:'REQUESTED',emergency_type:'OPD_AMBULANCE',pickup_lat:28.48127+r.index*.00002,pickup_lng:79.443282,pickup_address:runId,pickup_landmark:'Load gate '+r.index,drop_lat:28.49,drop_lng:79.45,drop_address:'Isolated hosted load destination',ride_otp_code:'2468',is_demo:true,is_sos:false,dispatch_started_at:dispatchAt,fare_estimate_inr:300,payable_inr:0,discount_inr:300,coupon_code:'PILOT100'})))}`;
        await tx`INSERT INTO sos_dispatch_attempts ${tx(rides.map(r=>({booking_id:r.id,driver_id:r.driverId,wave_number:1,distance_km:1,pushed_at:new Date()})))}`;
      });seeded=true;
      rides.forEach(r=>{r.ut=sign(r.userId,'user');r.dt=sign(r.driverId,'driver');});
      const same=await api('environment-binding','/api/v1/bookings/'+rides[0].id,rides[0].ut);assert.equal(same.booking.pickupAddress,runId,'API does not use this isolated DB');
    });
    await stage('Accept 50 offers through hosted API',async()=>{
      await parallel(rides,50,async r=>{const d=await api('accept','/api/v1/bookings/'+r.id+'/accept',r.dt,{});assert.equal(d.booking.driverId,r.driverId);assert.equal(d.booking.status,'ACCEPTED');});
    });
    await stage('Connect 100 sockets and challenge cross-ride subscriptions',async()=>{
      await parallel(rides,25,async(r,i)=>{[r.us,r.ds]=await Promise.all([connect(r,'user'),connect(r,'driver')]);r.us.emit('booking:subscribe',{bookingId:rides[(i+1)%50].id});});
      // Subscription has no ACK in this protocol; observe a real per-ride probe.
      await sleep(2000);rides.forEach(r=>emit(r,point(r,0)));await drained();
      await parallel(rides,25,async(r,i)=>{await api('forbidden-other-ride','/api/v1/bookings/'+rides[(i+1)%50].id,r.ut,undefined,[403]);});
    });
    await stage('50 concurrent active rides at five-second cadence',async()=>{
      await sleep(1100); // Respect the realtime server's per-driver one-second packet limit after the initial probe.
      const start=performance.now();let overruns=0;
      for(let cycle=0;cycle<c.cycles;cycle++) {
        check();const cycleAt=performance.now();
        await parallel(rides,50,async r=>{const p=point(r,cycle+1);uploadedTimestamps.add(r.id+':'+p.ts);emit(r,p);await Promise.all([
          api('booking-poll','/api/v1/bookings/'+r.id,r.ut).then(d=>{assert.equal(d.booking.id,r.id);assert.equal(d.booking.driverId,r.driverId);}),
          api('live-gps-batch','/api/v1/driver/location-batch',r.dt,{points:[p],partial:true}).then(d=>{const a=validateAck(d,[p]);assert.equal(a.rejected.length,0);})]);
        });
        if(performance.now()-cycleAt>5000)overruns++;
        await sleep(Math.max(0,5000-(performance.now()-cycleAt)));
        assert.ok(pending.size<=50*(Math.ceil(c.deliveryTimeoutMs/5000)+1),'Realtime delivery backlog exceeded bounded observation budget');
        if((cycle+1)%12===0)console.log(JSON.stringify({stage:'steady',cycle:cycle+1,totalCycles:c.cycles,pendingGps:pending.size}));
      }
      await drained();report.steady={cycles:c.cycles,durationMs:Math.round(performance.now()-start),requests:c.cycles*100,overrunCycles:overruns};
    });
    await stage('Reconnect 25 users and verify fresh delivery',async()=>{
      const sample=rides.slice(0,25);sample.forEach(r=>r.us.disconnect());await parallel(sample,25,r=>reconnect(r.us));await sleep(2000);
      sample.forEach(r=>emit(r,point(r,2000)));await drained();report.reconnect={users:25,verifiedFreshDeliveries:25};
    });
    await stage('Replay 1000 buffered points twice and retain rejected points',async()=>{
      const batches=rides.map(r=>({r,points:Array.from({length:20},(_,i)=>{
        let ts=Date.now()-90000+i*1000;
        while(uploadedTimestamps.has(r.id+':'+ts))ts++;
        uploadedTimestamps.add(r.id+':'+ts);return point(r,i,ts);
      })}));const at=performance.now();
      await parallel(batches,50,async({r,points})=>{await Promise.all([0,1].map(async()=>{const a=validateAck(await api('offline-replay','/api/v1/driver/location-batch',r.dt,{points,partial:true}),points);assert.equal(a.rejected.length,0);}));});
      report.offline={uniquePoints:1000,replayRequests:100,durationMs:Math.round(performance.now()-at),nativeStorageTested:false};
      const r=rides[0],points=[point(r,4000),{...point(r,4001),bookingId:rides[1].id}];
      const d=await api('mixed-owner-batch','/api/v1/driver/location-batch',r.dt,{points,partial:true});const a=validateAck(d,points);
      assert.equal(a.accepted.length,1);assert.equal(a.rejected.length,1);assert.equal(d.rejected[0].reason,'not_assigned_to_booking');
      report.offline.retainedRejectedSimulation=1;
      const [dup]=await sql`SELECT count(*)::int AS n FROM (SELECT driver_id,booking_id,recorded_at FROM driver_locations WHERE booking_id=ANY(${rides.map(r=>r.id)}::uuid[]) GROUP BY driver_id,booking_id,recorded_at HAVING count(*)>1) d`;assert.equal(dup.n,0);report.offline.duplicateRows=dup.n;
      const [persisted]=await sql`SELECT count(*)::int AS n FROM driver_locations WHERE booking_id=ANY(${rides.map(r=>r.id)}::uuid[])`;
      assert.equal(persisted.n,c.cycles*50+1001,'Every accepted unique GPS point must be persisted');report.offline.persistedUniqueRows=persisted.n;
    });
    await stage('Arrive, verify pickup and inspect 50 onboard rides',async()=>{
      await parallel(rides,50,async r=>{const d=await api('arrived','/api/v1/bookings/'+r.id+'/arrived',r.dt,{});assert.equal(d.booking.status,'ARRIVED');});
      await parallel(rides,50,async r=>{const d=await api('pickup','/api/v1/bookings/'+r.id+'/pickup',r.dt,{code:'2468'});assert.equal(d.booking.status,'PICKED_UP');assert.equal(d.booking.dropLat,28.49);});
    });
    if(c.mapsEnabled) await stage('Bounded real provider HTTP phase',async()=>{
      await parallel(rides,50,async r=>{
        const fresh=point(r,5000);
        const ack=validateAck(await api('pre-maps-gps','/api/v1/driver/location-batch',r.dt,{points:[fresh],partial:true}),[fresh]);assert.equal(ack.rejected.length,0);
        for(const [label,url] of [['maps-landmarks',`/api/v1/places/landmarks?lat=${28.48127+r.index*.0002}&lng=79.443282&language=en`],['maps-live-eta',`/api/v1/bookings/${r.id}/live-eta`]]) {
          assert.ok(++report.maps.httpCalls<=c.maxMapHttpCalls,'Map HTTP budget exceeded');
          const d=await api(label,url,r.ut);
          if(label==='maps-landmarks'){assert.ok(Array.isArray(d.landmarks));assert.equal(d.provider,'google');report.maps.available++;}
          else if(d.available && d.source==='google' && Array.isArray(d.path) && d.path.length>1)report.maps.available++;
          else report.maps.unavailable++;
        }
      });
      assert.equal(report.maps.unavailable,0,'Provider degraded/unavailable; HTTP200 is not a provider pass');
    });
    await stage('Complete 50 rides and settle launch receipts',async()=>{
      await parallel(rides,50,async r=>{const d=await api('complete','/api/v1/bookings/'+r.id+'/complete',r.dt,{});assert.equal(d.booking.status,'COMPLETED');});
      await parallel(rides,50,async r=>{const d=await api('mark-paid','/api/v1/bookings/'+r.id+'/mark-paid',r.ut,{couponCode:'PILOT100'});assert.equal(d.paid.inr,0);});
    });
    assert.equal(report.gps.crossRide,0);assert.equal(report.gps.duplicates,0);assert.equal(report.gps.unexpected,0);assert.equal(report.socketErrors,0);assert.equal(report.gps.received,report.gps.expected);
    assert.ok(percentile(report.http['booking-poll'].times,.95)<=c.httpP95Ms,'Booking poll p95 exceeds predeclared budget');
    assert.ok(percentile(report.http['live-gps-batch'].times,.95)<=c.httpP95Ms,'GPS upload p95 exceeds predeclared budget');
    assert.ok(percentile(gpsTimes,.95)<=c.gpsP95Ms,'Realtime delivery p95 exceeds predeclared budget');
    report.verdict='PASS';
  } catch(error) {report.verdict='FAIL';report.error=safe(error.message);process.exitCode=1;}
  finally {
    sockets.forEach(socket=>socket.disconnect());
    if(seeded) {
      try {
        await sql.begin(async tx=>{
          await tx`UPDATE bookings SET status='CANCELLED',cancelled_at=NOW() WHERE id=ANY(${rides.map(r=>r.id)}::uuid[]) AND user_id=ANY(${rides.map(r=>r.userId)}::uuid[]) AND is_demo=true AND status IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')`;
          await tx`UPDATE drivers SET status='OFFLINE' WHERE id=ANY(${rides.map(r=>r.driverId)}::uuid[]) AND name=${runId} AND is_demo=true`;
        });report.cleanup='own_fixtures_inactive_retained_for_evidence';
      }catch(error){report.cleanup='FAILED';report.cleanupError=safe(error.message);report.verdict='FAIL';process.exitCode=1;}
    }
    try {await sql.end({timeout:5});} catch(error) {report.databaseCloseError=safe(error.message);report.verdict='FAIL';process.exitCode=1;}
    try {await transport.close();} catch(error) {report.transportCloseError=safe(error.message);report.verdict='FAIL';process.exitCode=1;}
    report.httpTransport=transport.summary();
    process.off('SIGINT',stop);process.off('SIGTERM',stop);
    report.finishedAt=new Date().toISOString();report.gps.deliveryMs=summary(gpsTimes);report.connectMs=summary(connectTimes);
    for(const metric of Object.values(report.http)){metric.latencyMs=summary(metric.times);delete metric.times;}
    report.fixtureIds=rides.map(({id,userId,driverId})=>({id,userId,driverId}));
    fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({verdict:report.verdict,report:path.resolve(reportFile)}));
  }
}
main().catch(error=>{console.error('Load runner stopped:',error.code || (error.name==='AssertionError'?'guard_or_assertion_failed':'configuration_or_runtime_error'));process.exitCode=1;});
