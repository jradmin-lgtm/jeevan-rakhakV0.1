/* V2 only: actual app reconnection, subscription, refresh and timestamp selection. */
const assert=require('node:assert/strict');
const {createSocketDevice,createUserView,HASHES}=require('./production-socket.cjs');
const {createRealtimeMonitor}=require('./realtime-resilience.cjs');
function createRealtimeClient({rides,origin,io,http,report,now=()=>performance.now(),wall=Date.now,setIntervalFn=setInterval,clearIntervalFn=clearInterval}){
 const monitor=createRealtimeMonitor({rides,now,wall}),devices=[],views=new Map(),operations=new Set(),controlled=new Set();
 let fatal=null,closing=false,hooks=null,observationClosed=false;
 report.realtimeClient={sourceBindings:HASHES,warnings:0,refreshErrors:0,connectErrors:0,sessionErrors:0,securityFailures:0,postWindowDisconnects:0,observationClosed:false};
 const info=report.realtimeClient;
 const summary=()=>({...monitor.summary(),connectErrors:info.connectErrors,rawSocketVerdict:monitor.summary().naturalDisconnects||info.connectErrors?'FAIL':'PASS'});
 const fail=message=>{fatal??=new Error(message);};
 function validate(data,r){assert.equal(data?.booking?.id,r.id,'Wrong booking response');assert.equal(data.booking.driverId,r.driverId,'Wrong driver response');const pos=data.driverPosition;if(pos!=null)assert.ok(Number.isFinite(pos.lat)&&Number.isFinite(pos.lng)&&Number.isFinite(Date.parse(pos.lastSeenAt)),'Malformed authorized driver position');return data;}
 async function getBooking(r){const started=now();const p=(async()=>{try{const data=validate(await http('booking-poll','/api/v1/bookings/'+r.id,r.ut,undefined,45000),r);hooks?.recovered('user-poll:'+r.id);return data;}catch(error){info.refreshErrors++;hooks?.failed('user-poll:'+r.id,error,started);if(error?.status===401||error?.status===403||error?.code==='ERR_ASSERTION'||error instanceof SyntaxError){info.securityFailures++;fail('Authorized UI refresh protocol or session rejected');}throw error;}})();operations.add(p);p.then(()=>operations.delete(p),()=>operations.delete(p));return p;}
 async function connect(r,role){const device=createSocketDevice({role,token:role==='user'?r.ut:r.dt,origin,io,warn:()=>info.warnings++});devices.push(device);const socket=await device.getSocket();
  socket.on('connect',()=>{if(!observationClosed)monitor.connect(r.id,role);});if(socket.connected)monitor.connect(r.id,role);
  socket.on('disconnect',reason=>{if(!closing){if(observationClosed)info.postWindowDisconnects++;else monitor.disconnect(r.id,role,reason,controlled.delete(r.id+':'+role));}});
  socket.on('connect_error',error=>{info.connectErrors++;if(['account_authentication_failed','missing_token'].includes(error?.message)){info.securityFailures++;fail('Socket authentication rejected');}});
  socket.on('session:error',()=>{info.sessionErrors++;fail('Realtime session rejected');});
  if(role==='user'){socket.on('driver:location:update',p=>monitor.receive(r.id,p));const view=createUserView({socket,bookingId:r.id,now:wall,getBooking:()=>getBooking(r),onApplied:fix=>monitor.observe(r.id,fix),onRefreshError:()=>info.warnings++});views.set(r.id,view);}
  return socket;
 }
 return{monitor,connect,sourceBindings:HASHES,attachPollHooks(value){assert.equal(hooks,null);hooks=value;},refresh:r=>views.get(r.id).refresh(),emitted:(r,p)=>monitor.emitted(r.id,p),check(){if(fatal)throw fatal;monitor.check();},async warmup({emit,point,check,sleep}){monitor.start();const at=now();for(let tick=0;tick<4;tick++){for(const r of rides)emit(r,point(r,8000+tick));await Promise.all(rides.map(r=>views.get(r.id).refresh()));this.check();check();await sleep(Math.max(0,at+(tick+1)*5000-now()));}while(now()-at<20000)await sleep(Math.max(1,Math.ceil(20000-(now()-at))));this.check();monitor.ready();report.realtimeClient.warmup={durationMs:Math.round(now()-at),excludedFromSteadySeconds:20,usedActualFixTimestamps:true};},startTail({emit,point}){const at=now();let round=0,stopped=false;const timer=setIntervalFn(()=>{if(stopped)return;try{assert.ok(now()-at<=120000,'Poststeady realtime tail exceeded120s');for(const r of rides)emit(r,point(r,400+(++round)));this.check();}catch(error){clearIntervalFn(timer);fail('Poststeady realtime tail failed');}},5000);return()=>{if(stopped)return;stopped=true;clearIntervalFn(timer);info.tail={durationMs:Math.round(now()-at),socketOnly:true,probeRounds:round/rides.length};};},async settle(){await Promise.allSettled([...operations]);if(fatal)throw fatal;},force(r,role){const s=role==='user'?r.us:r.ds;assert.ok(s.connected&&s.io.engine);controlled.add(r.id+':'+role);s.io.engine.close();},finish(){this.check();monitor.finish();observationClosed=true;info.observationClosed=true;report.realtimeClient.monitor=summary();},close(){closing=true;views.forEach(v=>v.cleanup());devices.forEach(d=>d.disconnectSocket());},summary};
}
module.exports={createRealtimeClient};

async function recoverUsers({realtime,rides,emit,point,check,sleep,now=()=>performance.now(),wall=Date.now}){
 const started=now(),forcedAt=wall(),sample=rides.slice(0,rides.length/2);sample.forEach(r=>realtime.force(r,'user'));let nextProbe=started+1100,probes=0;
 for(;;){check();realtime.check();assert.ok(now()-started<=20000,'Fresh automatic user reconnect exceeded20s');if(now()>=nextProbe){for(const r of rides)emit(r,point(r,2000+probes));probes++;nextProbe+=5000;}
  const m=realtime.summary(),episodes=m.perRide.flatMap(r=>r.episodes).filter(e=>e.controlled),freshObservedRides=m.perRide.filter(r=>Number.isFinite(r.lastFixTs)&&r.lastFixTs>=forcedAt).length;
  if(episodes.length===sample.length&&episodes.every(e=>e.role==='user'&&e.recoveredMs!==null)&&m.perRide.every(r=>r.episodes.every(e=>e.recoveredMs!==null))&&freshObservedRides===rides.length){const recoveryMs=Math.round(now()-started);realtime.check();realtime.finish();await realtime.settle();return{users:sample.length,verifiedFreshDeliveries:sample.length,actualAutomaticReconnect:true,freshObservedRides,freshnessSource:'actual_UI_fix_timestamp',probeRounds:probes,recoveryMs};}
  await sleep(100);
 }
}
module.exports.recoverUsers=recoverUsers;
