const fs = require('node:fs'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const env = process.env;
assert.ok(env.DATABASE_URL && env.JWT_SECRET, 'DATABASE_URL and JWT_SECRET are required');
assert.ok(['localhost','127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname));
const sql = require('../../../packages/db/node_modules/postgres')(env.DATABASE_URL);
const base = env.TEST_API_BASE;
assert.ok(base && ['localhost','127.0.0.1'].includes(new URL(base).hostname), 'TEST_API_BASE must be isolated localhost');
const results = [], stamp = Date.now();
const token = (id,role) => { const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'); const b=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,role,exp:Math.floor(Date.now()/1000)+7200});return b+'.'+crypto.createHmac('sha256',env.JWT_SECRET).update(b).digest('base64url'); };
async function request(path,identity,body) { const start=performance.now();const r=await fetch(base+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(identity?{authorization:'Bearer '+token(identity.id,identity.role)}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json(),ms:performance.now()-start}; }
function pass(name,condition,extra={}) { assert.ok(condition,name);results.push({name,pass:true,...extra});console.log('PASS',name); }
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function make(role,i,lat=28.48127) { const table=role==='user'?'users':'drivers'; const [row]=role==='user'?await sql`INSERT INTO users(phone,name,is_demo) VALUES(${'team-user-'+stamp+'-'+i},'Team QA user',true) RETURNING *`:await sql`INSERT INTO drivers(phone,name,is_demo,kyc_verified,status,last_lat,last_lng,last_seen_at,vehicle_number) VALUES(${'team-driver-'+stamp+'-'+i},'Team QA driver',true,true,'AVAILABLE',${lat},79.443282,now(),${'QA-'+i}) RETURNING *`;return {...row,role}; }
async function book(u,sos=false,lat=28.48127) {const r=await request('/bookings',u,{emergencyType:sos?'BREATHING_DISTRESS':'OPD_AMBULANCE',isSos:sos,pickupLat:lat,pickupLng:79.443282,pickupAddress:'Isolated QA pickup',pickupLandmark:'QA meeting area'});assert.equal(r.status,201,JSON.stringify(r.body));return {b:r.body.booking,ms:r.ms}; }
async function run() {
 const old = await sql`SELECT id,status FROM drivers WHERE status='AVAILABLE'`;await sql`UPDATE drivers SET status='OFFLINE' WHERE status='AVAILABLE'`;
 const users=[],drivers=[];
 try {
  for(let i=0;i<4;i++){users.push(await make('user',i));drivers.push(await make('driver',i,28.48127+i*0.003));}
  const first=await book(users[0]);
  let attempts=await sql`SELECT * FROM sos_dispatch_attempts WHERE booking_id=${first.b.id}`;
  pass('Normal booking initially offered only to nearest driver',attempts.length===1&&attempts[0].driver_id===drivers[0].id);
  const hidden=await request('/driver/incoming',drivers[3]);pass('Never-offered driver cannot see normal ride',!hidden.body.requests.some(x=>x.id===first.b.id));
  const denied=await request('/bookings/'+first.b.id+'/accept',drivers[3],{});pass('Never-offered driver cannot accept by ID',denied.status>=400);
  const rejected=await request('/bookings/'+first.b.id+'/reject',drivers[0],{});pass('Normal rejection saved',rejected.status===200);
  pass('Rejected normal request stays hidden',!(await request('/driver/incoming',drivers[0])).body.requests.some(x=>x.id===first.b.id));
  await wait(2400);attempts=await sql`SELECT * FROM sos_dispatch_attempts WHERE booking_id=${first.b.id} ORDER BY pushed_at`;
  pass('Next nearest driver gets second wave after interval',attempts.length>=2&&attempts[1].driver_id===drivers[1].id&&(+attempts[1].pushed_at-+attempts[0].pushed_at)>=1800);
  const accepted=await request('/bookings/'+first.b.id+'/accept',drivers[1],{});pass('Offered normal booking accepts with normal semantics',accepted.status===200&&accepted.body.booking.isSos===false);
  const [audit]=await sql`SELECT count(*)::int n FROM booking_events WHERE booking_id=${first.b.id} AND type='booking.accepted'`;pass('Assignment audit committed',audit.n===1);
  pass('Reject after accept cannot succeed',(await request('/bookings/'+first.b.id+'/reject',drivers[1],{})).status===409);
  const oldFix=Date.now()-26*3600000;
  await sql`UPDATE booking_events SET created_at=${new Date(oldFix-60000)} WHERE booking_id=${first.b.id} AND type='booking.accepted'`;
  await sql`INSERT INTO booking_cancellations(booking_id,driver_id,reason_code,outcome) VALUES(${first.b.id},${drivers[1].id},'VEHICLE_BREAKDOWN','RE_DISPATCHED')`;
  await sql`UPDATE bookings SET driver_id=${drivers[2].id},status='ACCEPTED' WHERE id=${first.b.id}`;
  const saved={bookingId:first.b.id,lat:28.48,lng:79.44,ts:oldFix};
  const gps=await request('/driver/location-batch',drivers[1],{points:[saved]});pass('Released driver backfills original assignment including history older than24h',gps.status===200&&gps.body.accepted===1&&gps.body.expired===0);
  await Promise.all(Array.from({length:4},()=>request('/driver/location-batch',drivers[1],{points:[saved]})));
  const [dups]=await sql`SELECT count(*)::int n FROM driver_locations WHERE booking_id=${first.b.id} AND driver_id=${drivers[1].id} AND recorded_at=${new Date(oldFix)}`;pass('Historical concurrent retry is idempotent',dups.n===1);
  pass('Released driver cannot inject post-release GPS',(await request('/driver/location-batch',drivers[1],{points:[{...saved,ts:Date.now()+1000}]})).status===403);
  pass('Unrelated driver cannot backfill',(await request('/driver/location-batch',drivers[3],{points:[saved]})).status===403);
  const event={id:crypto.randomUUID(),event:'home.book',ts:Date.now()};
  const clicks=await request('/ui-events',users[0],{events:[event]});pass('Authenticated named click accepted',clicks.status===200&&clicks.body.acknowledged[0]===event.id);
  await request('/ui-events',users[0],{events:[event]});const [count]=await sql`SELECT count(*)::int n FROM ui_events WHERE id=${event.id}`;pass('Click retries deduplicate',count.n===1);
  pass('Arbitrary typed click properties rejected',(await request('/ui-events',users[0],{events:[{...event,address:'should never store'}]})).status===400);
  pass('Wrong app role click rejected',(await request('/ui-events',drivers[0],{events:[event]})).status===400);
  pass('Unauthenticated click rejected',(await request('/ui-events',null,{events:[event]})).status===401);
  pass('Oversized analytics batch rejected',(await request('/ui-events',users[0],{events:Array(51).fill(event)})).status===400);
  // One race tests the common booking lock for acceptance and rejection.
  const race=await book(users[1]);const [offer]=await sql`SELECT driver_id FROM sos_dispatch_attempts WHERE booking_id=${race.b.id} ORDER BY pushed_at LIMIT 1`;
  const actor=drivers.find(d=>d.id===offer.driver_id);assert.ok(actor);
  const [a,r]=await Promise.all([request('/bookings/'+race.b.id+'/accept',actor,{}),request('/bookings/'+race.b.id+'/reject',actor,{})]);
  const [state]=await sql`SELECT a.accepted_at,a.rejected_at,b.status FROM sos_dispatch_attempts a JOIN bookings b ON b.id=a.booking_id WHERE a.booking_id=${race.b.id} AND a.driver_id=${actor.id}`;
  pass('Concurrent accept/reject cannot both win',!(state.accepted_at&&state.rejected_at)&&!(a.status===200&&r.status===200));
  fs.writeFileSync('/tmp/jr-team-test-identities.json',JSON.stringify({users,drivers,bookingIds:[first.b.id,race.b.id]}),{mode:0o600});
 } finally {
  await sql`UPDATE bookings SET status='CANCELLED',cancelled_at=now() WHERE user_id IN (SELECT id FROM users WHERE phone LIKE ${'team-user-'+stamp+'-%'}) AND status IN ('REQUESTED','ACCEPTED','ARRIVED','PICKED_UP')`;
  await sql`UPDATE drivers SET status='OFFLINE' WHERE phone LIKE ${'team-driver-'+stamp+'-%'}`;
  for(const d of old)await sql`UPDATE drivers SET status=${d.status} WHERE id=${d.id}`;
 }
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{fs.writeFileSync('/tmp/jr-team-integration-results.json',JSON.stringify(results,null,2));await sql.end();});
