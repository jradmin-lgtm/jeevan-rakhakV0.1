const fs = require('fs'), crypto = require('crypto'), assert = require('assert/strict');
const root = require('path').resolve(__dirname, '../../..');
const env = process.env;
if (!env.DATABASE_URL || !['localhost', '127.0.0.1', 'postgres'].includes(new URL(env.DATABASE_URL).hostname)) throw Error('Isolated database required');
const sql = require(root + '/packages/db/node_modules/postgres')(env.DATABASE_URL, {max:10});
const { io } = require(root + '/apps/driver-app/node_modules/socket.io-client');
const base = env.TEST_API_BASE || 'http://127.0.0.1:4100', socketBase = env.TEST_SOCKET_BASE || 'http://127.0.0.1:4101';
for (const url of [base, socketBase]) if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('Local endpoints required');
const sign = claims => { const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'); const body=enc({alg:'HS256',typ:'JWT'})+'.'+enc({exp:Math.floor(Date.now()/1000)+3600,...claims});return body+'.'+crypto.createHmac('sha256',env.JWT_SECRET).update(body).digest('base64url'); };
const cycles=Number(env.TEST_LOAD_CYCLES||3);
const counts=(env.TEST_LOAD_COUNTS||'25,100,500').split(',').map(Number);
if(!Number.isInteger(cycles)||cycles<3||cycles>720||counts.some(n=>!Number.isInteger(n)||n<1||n>500))throw Error('Load scope must be 1 to 500 rides and 3 to 720 cycles');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const percentile=(xs,p)=>xs.length?Math.round([...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]*10)/10:null;
async function mapLimit(items,limit,fn){let cursor=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=cursor++;if(i>=items.length)return;await fn(items[i],i);}}));}
async function stage(count) {
 const start=Date.now(), prefix='load-'+start+'-'+count;
 const rides=Array.from({length:count},(_,i)=>({userId:crypto.randomUUID(),driverId:crypto.randomUUID(),id:crypto.randomUUID(),index:i}));
 await sql`INSERT INTO users ${sql(rides.map(r=>({id:r.userId,phone:prefix+'u'+r.index,name:'Isolated load user',is_demo:true})))}`;
 await sql`INSERT INTO drivers ${sql(rides.map(r=>({id:r.driverId,phone:prefix+'d'+r.index,name:'Isolated load driver',is_demo:true,kyc_verified:true,status:'ON_TRIP',last_lat:28.4771,last_lng:79.4381})))}`;
 await sql`INSERT INTO bookings ${sql(rides.map(r=>({id:r.id,user_id:r.userId,driver_id:r.driverId,status:'ACCEPTED',emergency_type:'OPD_AMBULANCE',pickup_lat:28.48127,pickup_lng:79.443282,pickup_address:'Isolated load fixture'})))}`;
 const sockets=[],httpTimes=[],deliveryTimes=[],connectTimes=[],responses={};let crossRide=0,connectErrors=0,gpsReceived=0,httpErrors=0;
 const connect=async(token)=>{const at=performance.now();const socket=io(socketBase,{auth:{token},transports:['websocket'],reconnection:false,timeout:15000});sockets.push(socket);await new Promise(resolve=>{socket.once('connect',()=>{connectTimes.push(performance.now()-at);resolve();});socket.once('connect_error',()=>{connectErrors++;resolve();});});return socket;};
 const request=async(path,token,body)=>{const at=performance.now();try{const response=await fetch(base+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(15000),headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});await response.arrayBuffer();responses[response.status]=(responses[response.status]||0)+1;if(response.status!==200)httpErrors++;}catch(error){httpErrors++;responses.network=(responses.network||0)+1;}finally{httpTimes.push(performance.now()-at);}};
 try{
  await mapLimit(rides,50,async ride=>{
    ride.ut=sign({sub:ride.userId,role:'user'});ride.dt=sign({sub:ride.driverId,role:'driver'});
    [ride.us,ride.ds]=await Promise.all([connect(ride.ut),connect(ride.dt)]);
    ride.us.on('driver:location:update',point=>{if(point.bookingId!==ride.id){crossRide++;return;}gpsReceived++;deliveryTimes.push(Date.now()-point.ts);});
    ride.us.emit('booking:subscribe',{bookingId:ride.id});
  });
  await sleep(1000);
  const trafficStart=Date.now();
  for(let cycle=0;cycle<cycles;cycle++){
   const cycleStart=Date.now();
   await mapLimit(rides,100,async ride=>{
     const point={bookingId:ride.id,lat:28.4771+cycle*0.0001,lng:79.4381,ts:Date.now()};
     ride.ds.emit('driver:location',point);
     await Promise.all([request('/api/v1/bookings/'+ride.id,ride.ut),request('/api/v1/driver/location-batch',ride.dt,{points:[point]})]);
   });
   await sleep(Math.max(0,5000-(Date.now()-cycleStart)));
   if(cycles>12 && (cycle+1)%12===0)console.log(JSON.stringify({progress:true,rides:count,cycle:cycle+1,totalCycles:cycles,httpErrors,crossRide,gpsReceived}));
  }
  const trafficSeconds=(Date.now()-trafficStart)/1000;
  const sample=rides.slice(0,Math.min(25,count));
  const reconnectStart=Date.now();
  for(const ride of sample){ride.us.disconnect();ride.us.connect();}
  await sleep(2000);
  const reconnectFailures=sample.filter(ride=>!ride.us.connected).length;
  // Offline flush: historical points with a fresh final point. Repeat the same batch to prove idempotency under concurrency.
  const batches=rides.map(ride=>({ride,points:Array.from({length:20},(_,i)=>({bookingId:ride.id,lat:28.4771+i*0.00001,lng:79.4381,ts:Date.now()-60000+i*1000}))}));
  const flushStart=Date.now();await mapLimit(batches,100,async({ride,points})=>{await request('/api/v1/driver/location-batch',ride.dt,{points});await request('/api/v1/driver/location-batch',ride.dt,{points});});
  const [duplicates]=await sql`SELECT count(*)::int AS n FROM (SELECT driver_id,recorded_at FROM driver_locations WHERE booking_id=ANY(${rides.map(r=>r.id)}::uuid[]) GROUP BY driver_id,recorded_at HAVING count(*)>1) d`;
  const result={rides:count,connections:count*2,durationSeconds:Math.round((Date.now()-start)/100)/10,requests:httpTimes.length,responses,httpErrors,httpLatencyMs:{p50:percentile(httpTimes,.5),p95:percentile(httpTimes,.95),p99:percentile(httpTimes,.99),max:Math.round(Math.max(...httpTimes))},steadyRequestsPerSecond:Math.round(count*2*cycles/trafficSeconds*10)/10,connectErrors,connectP95Ms:percentile(connectTimes,.95),gpsExpected:count*cycles,gpsReceived,gpsDeliveryMs:{p95:percentile(deliveryTimes,.95),max:Math.max(...deliveryTimes)},crossRide,reconnectFailures,reconnectSample:sample.length,reconnectObservationMs:Date.now()-reconnectStart,offlinePoints:count*20,offlineFlushMs:Date.now()-flushStart,duplicateRows:duplicates.n};
  console.log(JSON.stringify(result));
  assert.equal(httpErrors,0,'All expected local HTTP requests must succeed');assert.equal(connectErrors,0);assert.equal(crossRide,0);assert.equal(reconnectFailures,0);assert.equal(duplicates.n,0);assert.equal(gpsReceived,count*cycles,'No location updates lost in connected test');
  return result;
 } finally {
  sockets.forEach(s=>s.disconnect());
  await sql`UPDATE bookings SET status='CANCELLED' WHERE id=ANY(${rides.map(r=>r.id)}::uuid[])`;
  await sql`UPDATE drivers SET status='OFFLINE' WHERE id=ANY(${rides.map(r=>r.driverId)}::uuid[])`;
 }
}
(async()=>{const results=[];for(const n of counts)results.push(await stage(n));const report={environment:'Isolated local PostgreSQL 16, API and Socket.IO. Not a production hosting capacity guarantee.',scope:'Authenticated booking polls, GPS batch writes, per-ride socket delivery, 25-client reconnect and repeated offline batches. Public map providers, FCM, dispatch offers and cold hosting excluded.',results};if(env.TEST_RESULTS_FILE)fs.writeFileSync(env.TEST_RESULTS_FILE,JSON.stringify(report,null,2));})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>sql.end());
