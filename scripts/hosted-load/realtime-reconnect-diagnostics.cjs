'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),net=require('node:net');
const {execFileSync,spawn}=require('node:child_process');
const {createSocketDevice,createUserView,HASHES}=require('./production-socket.cjs');
const root=path.resolve(__dirname,'../..'),NODE='/Users/kumar.sh/.local/opt/node-v24.20.0-darwin-arm64/bin/node';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function classify(emitted,received,broadcasts){
 const seen=new Map(),keys=new Set();for(const r of received){const key=r.bookingId+':'+r.ts;seen.set(key,(seen.get(key)??0)+1);}
 const result={steady:{expected:0,received:0,missing:0},controlled:{expected:0,received:0,missing:0},missingWhileAbsent:[],missingWhilePresent:[],unexplainedMissing:[],duplicates:0,unmatchedBroadcasts:0};
 for(const e of emitted){const key=e.bookingId+':'+e.ts;assert.ok(!keys.has(key),'duplicate_probe');keys.add(key);const n=seen.get(key)??0,group=result[e.phase];assert.ok(group,'known_phase');group.expected++;group.received+=Number(n>0);result.duplicates+=Math.max(0,n-1);const actual=broadcasts.filter(b=>b.bookingId===e.bookingId&&b.ts===e.ts);if(actual.length!==1)result.unmatchedBroadcasts++;if(n)continue;group.missing++;const row={phase:e.phase,round:e.round,index:e.index,ts:e.ts,userConnectedAtEmit:e.userConnectedAtEmit};if(actual.length!==1)result.unexplainedMissing.push(row);else if(actual[0].userIds.includes(e.userId))result.missingWhilePresent.push(row);else result.missingWhileAbsent.push(row);}
 for(const key of seen.keys())assert.ok(keys.has(key),'unexpected_probe');return result;
}
async function main(){
 assert.equal(process.argv[2],'--local-only');const output=process.argv[3];assert.ok(output&&!fs.existsSync(output),'new_private_output_required');
 const pg=require(root+'/packages/db/node_modules/postgres'),{io}=require(root+'/apps/driver-app/node_modules/socket.io-client');
 const source=fs.readFileSync(root+'/services/socket-server/src/server.ts');assert.deepEqual(source,execFileSync('git',['show','563cbd9eeb859b914f1874b6d2086de11b115f3e:services/socket-server/src/server.ts'],{cwd:root}),'exact_live_socket_source_required');
 const adminURL=new URL('postgres://postgres@127.0.0.1:5449/postgres');adminURL.password=execFileSync('docker',['exec','jr-release-audit-20261009','printenv','POSTGRES_PASSWORD'],{encoding:'utf8'}).trim();assert.ok(adminURL.password,'local_postgres_password_missing');
 const database='jr_reconnect_rca_'+crypto.randomBytes(6).toString('hex'),dbURL=new URL(adminURL);dbURL.pathname='/'+database;
 const secret=crypto.randomBytes(48).toString('hex'),admin=pg(adminURL.href,{max:1,connect_timeout:5,onnotice:n=>{throw Error('unexpected_local_admin_notice_'+n.code);}});
 let sql,child,created=false,serverExit=null,serverErrors='',serverOutput='',closing=false,phase='steady',round=0,crossRide=0,connectErrors=0,naturalDisconnects=0;
 const emitted=[],received=[],broadcasts=[],joins=[],connections=[],devices=[],views=[],forced=new Set(),ids=Array.from({length:10},(_,index)=>({index,id:crypto.randomUUID(),userId:crypto.randomUUID(),driverId:crypto.randomUUID()}));
 const report={scope:'Local exact socket-server source plus source-bound app socket and subscription handlers; minimal synthetic PostgreSQL schema and snapshot adapter; not hosted capacity or physical-phone proof',deployedSource:'563cbd9eeb859b914f1874b6d2086de11b115f3e',socketSourceSHA256:crypto.createHash('sha256').update(source).digest('hex'),appSources:HASHES,hostedLoadRequests:0,historicalCauseProved:false,controlledRounds:6,verdict:'FAIL',cleanup:{}};
 const started=Date.now();let failure;
 async function until(fn,limit=10000){const deadline=Date.now()+limit;while(!fn()){assert.ok(Date.now()<deadline,'local_condition_deadline');assert.ok(child&&child.exitCode===null,'local_server_exited');await wait(20);}}
 function sign(sub,role){const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),body=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub,role,exp:Math.floor(Date.now()/1000)+300});return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url');}
 function probe(){for(const r of ids){assert.ok(r.lastEmittedAt===undefined||Date.now()-r.lastEmittedAt>=1000,'diagnostic_driver_emit_rate_limit');const p={bookingId:r.id,lat:28.48+r.index*.00001,lng:79.44,ts:Date.now()};r.lastEmittedAt=p.ts;emitted.push({...p,phase,round,index:r.index,userId:r.userId,userConnectedAtEmit:r.us.connected});r.ds.emit('driver:location',p);}}
 try{
  assert.match(database,/^jr_reconnect_rca_[a-f0-9]{12}$/);await admin.unsafe('CREATE DATABASE '+database);created=true;sql=pg(dbURL.href,{max:2,connect_timeout:5});
  await sql.unsafe('CREATE TABLE users(id uuid PRIMARY KEY,disabled boolean NOT NULL DEFAULT false); CREATE TABLE drivers(id uuid PRIMARY KEY,disabled boolean NOT NULL DEFAULT false,kyc_verified boolean NOT NULL DEFAULT true,status text NOT NULL DEFAULT \'AVAILABLE\'); CREATE TABLE hospitals(id uuid PRIMARY KEY,portal_enabled boolean,portal_password_hash text); CREATE TABLE bookings(id uuid PRIMARY KEY,user_id uuid NOT NULL,driver_id uuid NOT NULL,status text NOT NULL)');
  for(const r of ids){await sql`INSERT INTO users(id) VALUES(${r.userId})`;await sql`INSERT INTO drivers(id) VALUES(${r.driverId})`;await sql`INSERT INTO bookings(id,user_id,driver_id,status) VALUES(${r.id},${r.userId},${r.driverId},'ACCEPTED')`;}
  const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(error=>error?reject(error):resolve(p));});});
  child=spawn(NODE,['--require',path.join(__dirname,'realtime-reconnect-observer.cjs'),'--import',root+'/services/socket-server/node_modules/tsx/dist/loader.mjs',root+'/services/socket-server/src/server.ts'],{cwd:root,env:{PATH:process.env.PATH,NODE_ENV:'test',DATABASE_URL:dbURL.href,JWT_SECRET:secret,INTERNAL_API_SECRET:crypto.randomBytes(40).toString('hex'),SOCKET_PORT:String(port),DB_POOL_MAX:'10',JR_LOCAL_RECONNECT_OBSERVER:'loopback-only'},stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.on('data',chunk=>{serverOutput=(serverOutput+chunk.toString()).slice(-20000);});child.stderr.on('data',chunk=>{serverErrors=(serverErrors+chunk.toString()).slice(-20000);});child.on('error',error=>{failure=error;});child.on('exit',(code,signal)=>{serverExit={code,signal};});child.on('message',row=>{if(row.kind==='broadcast')broadcasts.push(row);else if(row.kind==='joined')joins.push(row);else failure=Error('unknown_local_observer_message');});
  const origin='http://127.0.0.1:'+port;
  for(let i=0;i<100;i++){if(serverExit)throw Error('local_server_start_failed');try{const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(300)});if(r.status===200)break;throw Error('local_health_status');}catch(error){if(i===99)throw error;await wait(50);}}
  await Promise.all(ids.map(async r=>{for(const role of ['user','driver']){const d=createSocketDevice({role,token:sign(role==='user'?r.userId:r.driverId,role),origin,io});devices.push(d);const s=await d.getSocket();r[role==='user'?'us':'ds']=s;s.on('connect',()=>connections.push({index:r.index,role,at:Date.now()}));s.on('connect_error',()=>connectErrors++);s.on('disconnect',()=>{const key=r.index+':'+role;if(!closing&&!forced.delete(key))naturalDisconnects++;});if(role==='user'){s.on('driver:location:update',p=>{if(p.bookingId!==r.id){crossRide++;return;}received.push({index:r.index,...p,at:Date.now()});});views.push(createUserView({socket:s,bookingId:r.id,getBooking:async()=>({booking:{id:r.id,driverId:r.driverId},driverPosition:null})}));}}}));
  await until(()=>ids.every(r=>r.us.connected&&r.ds.connected)&&ids.every(r=>joins.some(j=>j.userId===r.userId&&j.room==='booking:'+r.id)));
  for(let i=0;i<3;i++){round=i;probe();await wait(1100);}
  phase='controlled';
  for(round=0;round<6;round++){
   const at=Date.now();for(const r of ids.slice(0,5)){forced.add(r.index+':user');r.us.io.engine.close();}
   await wait(Math.max(0,at+1100-Date.now()));probe();await wait(Math.max(0,at+6100-Date.now()));probe();
   await until(()=>ids.every(r=>r.us.connected));await wait(300);
  }
  await wait(1100);phase='steady';for(let i=0;i<3;i++){round=i+3;probe();await wait(1100);}
  await wait(200);if(failure)throw failure;assert.equal(connectErrors,0);assert.equal(naturalDisconnects,0);assert.equal(crossRide,0);
  report.delivery=classify(emitted,received,broadcasts);assert.equal(report.delivery.steady.missing,0,'steady_realtime_loss');assert.equal(report.delivery.duplicates,0);assert.equal(report.delivery.unmatchedBroadcasts,0,'untraced_broadcast');assert.equal(report.delivery.missingWhilePresent.length,0,'subscriber_present_at_broadcast_but_missing');assert.equal(report.delivery.unexplainedMissing.length,0);assert.ok(report.delivery.controlled.missing>0,'race_not_reproduced_this_run');assert.ok(report.delivery.missingWhileAbsent.every(p=>p.phase==='controlled'));
  report.verdict='LOCAL_RECONNECT_RACE_REPRODUCED';report.rawRealtimeVerdict='FAIL';report.connectErrors=connectErrors;report.naturalDisconnects=naturalDisconnects;report.crossRide=crossRide;report.durationMs=Date.now()-started;
 }catch(error){failure=error;report.error={code:error.code??error.name,reason:typeof error.message==='string'&&/^[a-z_]+$/.test(error.message)?error.message:'local_reproduction_or_assertion_failed'};}
 finally{
  closing=true;views.forEach(view=>view.cleanup());for(const d of devices)d.disconnectSocket();
  if(child&&child.exitCode===null){child.kill('SIGTERM');const end=Date.now()+5000;while(serverExit===null&&Date.now()<end)await wait(50);if(serverExit===null){child.kill('SIGKILL');await new Promise(resolve=>child.once('exit',resolve));}}
  report.cleanup.serverExited=serverExit!==null;if(sql)await sql.end({timeout:5});if(created){assert.equal(dbURL.hostname,'127.0.0.1');assert.equal(dbURL.port,'5449');assert.equal(dbURL.pathname,'/'+database);await admin.unsafe('DROP DATABASE '+database+' WITH (FORCE)');report.cleanup.onlyOwnedLocalDatabaseDropped=true;}await admin.end({timeout:5});
  const privateEvidence={...report,emitted,received,broadcasts,joins,connections,serverErrorsPresent:Boolean(serverErrors),serverErrorsRedacted:serverErrors.split(dbURL.href).join('[local-dsn]').split(adminURL.password).join('[local-password]').split(secret).join('[test-secret]'),serverOutput};fs.writeFileSync(output,JSON.stringify(privateEvidence,null,2)+'\n',{mode:0o600,flag:'wx'});
 }
 console.log(JSON.stringify(report));if(failure||report.verdict!=='LOCAL_RECONNECT_RACE_REPRODUCED')process.exitCode=1;
}
module.exports={classify};if(require.main===module)main().catch(error=>{console.error(JSON.stringify({localReconnectInvestigation:'STOPPED',code:error.code??error.name}));process.exitCode=1;});
