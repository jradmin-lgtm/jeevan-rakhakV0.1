const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto');
const env=process.env,root=require('path').resolve(__dirname,'../../..');
if(!env.DATABASE_URL||!['localhost','127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname))throw Error('Isolated database required');
const base=env.TEST_API_BASE||'http://127.0.0.1:4100';if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Isolated API required');
const sql=require(root+'/packages/db/node_modules/postgres')(env.DATABASE_URL),results=[];
const sign=(sub,role)=>{const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const b=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub,role,exp:Math.floor(Date.now()/1000)+3600});return b+'.'+crypto.createHmac('sha256',env.JWT_SECRET).update(b).digest('base64url')};
async function request(path,token,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});return {status:r.status,body:await r.json()};}
function check(name,ok){assert.ok(ok,name);results.push({name,pass:true});console.log('PASS',name)}
(async()=>{const stamp=Date.now();const[u]=await sql`INSERT INTO users(phone,name,is_demo)VALUES(${'landmark-u-'+stamp},'Landmark test',true)RETURNING id`;const[d]=await sql`INSERT INTO drivers(phone,name,is_demo,kyc_verified,status,last_lat,last_lng,last_seen_at)VALUES(${'landmark-d-'+stamp},'Landmark test driver',true,true,'AVAILABLE',28.48127,79.443282,now())RETURNING id`;const ut=sign(u.id,'user'),dt=sign(d.id,'driver');
check('Landmark search requires login',(await request('/api/v1/places/landmarks?lat=28.48&lng=79.44')).status===401);
for(const query of ['lat=91&lng=79','lat=28&lng=NaN','lat=28&lng=79&language=invalid'])check('Invalid landmark query rejected: '+query,(await request('/api/v1/places/landmarks?'+query,ut)).status===400);
const input={emergencyType:'OPD_AMBULANCE',pickupLat:28.48127,pickupLng:79.443282,pickupAddress:'SRMS test pickup',pickupLandmark:'  Village temple, north gate  '};
check('One-character landmark refused',(await request('/api/v1/bookings',ut,{...input,pickupLandmark:'X'})).status===400);
check('Oversized landmark refused',(await request('/api/v1/bookings',ut,{...input,pickupLandmark:'X'.repeat(241)})).status===400);
const created=await request('/api/v1/bookings',ut,input);check('Manual landmark accepted without changing pin',created.status===201&&created.body.booking.pickupLandmark==='Village temple, north gate'&&created.body.booking.pickupLat===input.pickupLat&&created.body.booking.pickupLng===input.pickupLng);
const id=created.body.booking.id;const accepted=await request('/api/v1/bookings/'+id+'/accept',dt,{});check('Assigned driver receives confirmed landmark',accepted.status===200&&accepted.body.booking.pickupLandmark==='Village temple, north gate');
const reread=await request('/api/v1/bookings/'+id,ut);check('Landmark survives booking refresh',reread.status===200&&reread.body.booking.pickupLandmark==='Village temple, north gate');
const near=await request('/api/v1/places/landmarks?lat=28.48127&lng=79.443282&language=en',ut);check('Provider returns bounded choices or explicit manual fallback',(near.status===200&&near.body.landmarks.length<=5&&near.body.landmarks.every(p=>p.distanceMeters<=2000))||(near.status===503&&near.body.manualEntryAvailable===true));
check('Nearby response contains no provider credential',!JSON.stringify(near.body).includes('AIza'));
await sql`UPDATE bookings SET status='CANCELLED' WHERE id=${id}`;await sql`UPDATE drivers SET status='OFFLINE' WHERE id=${d.id}`;
if(env.TEST_RESULTS_FILE)fs.writeFileSync(env.TEST_RESULTS_FILE,JSON.stringify({results,providerStatus:near.status,choices:near.body.landmarks?.length??0},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>sql.end());
