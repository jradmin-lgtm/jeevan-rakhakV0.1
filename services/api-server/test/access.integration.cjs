const fs = require('fs'), crypto = require('crypto'), assert = require('assert/strict');
const root = require('path').resolve(__dirname, '../../..');
const env = process.env;
if (!env.DATABASE_URL || !['localhost', '127.0.0.1', 'postgres'].includes(new URL(env.DATABASE_URL).hostname)) throw Error('Isolated database required');
const sql = require(root + '/packages/db/node_modules/postgres')(env.DATABASE_URL);
const { io } = require(root + '/apps/driver-app/node_modules/socket.io-client');
const base = env.TEST_API_BASE || 'http://127.0.0.1:4100', socketBase = env.TEST_SOCKET_BASE || 'http://127.0.0.1:4101';
for (const url of [base, socketBase]) if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw Error('Local endpoints required');
const results = [], sockets = [];
const sign = claims => { const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url'); const body = encode({ alg:'HS256',typ:'JWT' })+'.'+encode({exp:Math.floor(Date.now()/1000)+3600,...claims}); return body+'.'+crypto.createHmac('sha256',env.JWT_SECRET).update(body).digest('base64url'); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, value) => { assert.ok(value,name); console.log('PASS',name); results.push({name,pass:true}); };
async function api(path, token, body) { const response = await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}); return response.status; }
async function connect(token) { const s=io(socketBase,{auth:{token},transports:['websocket'],reconnection:false,timeout:3000}); sockets.push(s); const result=await new Promise(resolve=>{s.once('connect',()=>resolve(true));s.once('connect_error',()=>resolve(false));}); return {s,result}; }
async function main() {
 const suffix = Date.now().toString();
 const [user] = await sql`INSERT INTO users(phone,name) VALUES (${'+9161'+suffix},'Access test') RETURNING id`;
 const [driver] = await sql`INSERT INTO drivers(phone,name,status,kyc_verified) VALUES (${'+9162'+suffix},'Access driver','OFFLINE',false) RETURNING id`;
 const ut=sign({sub:user.id,role:'user'}),dt=sign({sub:driver.id,role:'driver'});
 check('Existing account API access',await api('/api/v1/me',ut)===200);
 await sql`UPDATE users SET disabled=true WHERE id=${user.id}`;
 check('Already issued user token revoked',await api('/api/v1/me',ut)===401);
 check('Disabled user realtime handshake refused',!(await connect(ut)).result);
 await sql`UPDATE users SET disabled=false WHERE id=${user.id}`;
 check('Unverified driver cannot go available',await api('/api/v1/driver/availability',dt,{status:'AVAILABLE'})===403);
 check('Driver cannot invent active trip',await api('/api/v1/driver/availability',dt,{status:'ON_TRIP'})===409);
 check('Out of range heartbeat rejected',await api('/api/v1/driver/heartbeat',dt,{lat:999,lng:79})===400);
 check('Stale heartbeat rejected',await api('/api/v1/driver/heartbeat',dt,{lat:28,lng:79,ts:Date.now()-180000})===400);
 await sql`UPDATE drivers SET kyc_verified=true WHERE id=${driver.id}`;
 const ts=Date.now();
 check('Fresh timestamped heartbeat',await api('/api/v1/driver/heartbeat',dt,{lat:28.4,lng:79.4,ts})===204);
 await api('/api/v1/driver/heartbeat',dt,{lat:28.1,lng:79.1,ts:ts-30000});
 const [position]=await sql`SELECT last_lat FROM drivers WHERE id=${driver.id}`;
 check('Delayed heartbeat cannot rewind location',position.last_lat===28.4);
 const {s:ds,result}=await connect(dt);check('Active driver socket connects',result);
 let offers=0;ds.on('booking:offered',()=>offers++);
 const emit=()=>fetch(socketBase+'/internal/booking-created',{method:'POST',headers:{'x-internal':env.INTERNAL_API_SECRET,'content-type':'application/json'},body:JSON.stringify({bookingId:crypto.randomUUID()})});
 await emit();await pause(200);check('Offline driver excluded from available room',offers===0);
 await api('/api/v1/driver/availability',dt,{status:'AVAILABLE'});ds.emit('driver:availability',{available:true});await pause(200);await emit();await pause(200);check('Verified available driver receives offer',offers===1);
 const [offer] = await sql`INSERT INTO bookings(user_id,status,emergency_type,pickup_lat,pickup_lng,pickup_address,pickup_landmark,ride_otp_code) VALUES (${user.id},'REQUESTED','OPD_AMBULANCE',28.4,79.4,'Access test pickup','Village temple north gate','1234') RETURNING id`;
 check('Unassigned driver cannot fetch private booking',await api('/api/v1/bookings/'+offer.id,dt)===403);
 const offerResponse=await fetch(base+'/api/v1/driver/incoming',{headers:{authorization:'Bearer '+dt}});
 check('Available driver can refresh offer summaries',offerResponse.status===200);
 const offered=(await offerResponse.json()).requests.find(row=>row.id===offer.id);
 check('Offer summary carries the saved landmark',offered?.pickup_landmark==='Village temple north gate');
 check('Offer summary excludes ride OTP',offered && !('rideOtpCode' in offered) && !('ride_otp_code' in offered));
 await sql`UPDATE bookings SET status='CANCELLED' WHERE id=${offer.id}`;
 const {s:us}=await connect(ut);
 const [booking]=await sql`INSERT INTO bookings(user_id,driver_id,status,emergency_type,pickup_lat,pickup_lng,pickup_address) VALUES (${user.id},${driver.id},'ACCEPTED','OPD_AMBULANCE',28.4,79.4,'Access test') RETURNING id`;
 us.emit('booking:subscribe',{bookingId:booking.id});await pause(200);let updates=0;us.on('driver:location:update',()=>updates++);
 ds.emit('driver:location',{bookingId:booking.id,lat:28.4,lng:79.4,ts:Date.now()});await pause(250);check('Assigned active ride receives location',updates===1);
 const activeRead=await fetch(base+'/api/v1/bookings/'+booking.id,{headers:{authorization:'Bearer '+ut}}).then(r=>r.json());
 check('Assigned active ride HTTP response retains driver position',activeRead.driverPosition?.lat===28.4);
 await sql`UPDATE bookings SET status='COMPLETED' WHERE id=${booking.id}`;await pause(1100);ds.emit('driver:location',{bookingId:booking.id,lat:28.4,lng:79.4,ts:Date.now()});await pause(250);check('Completed ride does not receive live GPS',updates===1);
 const ended=await fetch(base+'/api/v1/bookings/'+booking.id,{headers:{authorization:'Bearer '+ut}}).then(r=>r.json());
 check('Completed ride HTTP response excludes current driver position',ended.driverPosition===null);
 const endedEta=await fetch(base+'/api/v1/bookings/'+booking.id+'/live-eta',{headers:{authorization:'Bearer '+ut}}).then(r=>r.json());
 check('Completed ride ETA cannot expose current driver route',endedEta.available===false && endedEta.reason==='ride_not_active' && !endedEta.path);
 for(const status of ['CANCELLED','TIMED_OUT']){
  await sql`UPDATE bookings SET status=${status} WHERE id=${booking.id}`;
  const endedRead=await fetch(base+'/api/v1/bookings/'+booking.id,{headers:{authorization:'Bearer '+ut}}).then(r=>r.json());
  check(status+' ride HTTP response excludes driver position',endedRead.driverPosition===null);
 }
 await sql`UPDATE drivers SET disabled=true WHERE id=${driver.id}`;check('Already issued driver token revoked',await api('/api/v1/me',dt)===401);
 check('Disabled driver handshake refused',!(await connect(dt)).result);
 const {s:short}=await connect(sign({sub:user.id,role:'user',exp:Math.floor(Date.now()/1000)+2}));await pause(2200);check('Socket disconnects when token expires',!short.connected);
 if(env.TEST_RESULTS_FILE)fs.writeFileSync(env.TEST_RESULTS_FILE,JSON.stringify(results,null,2));console.log(results.length+' access checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{sockets.forEach(s=>s.disconnect());await sql.end();});
