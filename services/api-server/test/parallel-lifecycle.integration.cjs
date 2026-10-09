const fs = require('fs'), crypto = require('crypto'), assert = require('node:assert/strict');
const root = require('path').resolve(__dirname, '../../..');
const env = process.env, base = env.TEST_API_BASE;
for (const value of [env.DATABASE_URL, base]) if (!value || !['localhost', '127.0.0.1'].includes(new URL(value).hostname)) throw Error('Isolated local services required');
const sql = require(root + '/packages/db/node_modules/postgres')(env.DATABASE_URL);
const count = 50, started = Date.now(), prefix = 'lifecycle-' + started;
const identities = Array.from({length: count}, (_, i) => ({index:i,userId:crypto.randomUUID(),driverId:crypto.randomUUID()}));
const results = [];
const sign = (sub,role) => { const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url'); const b = enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub,role,exp:Math.floor(Date.now()/1000)+3600}); return b+'.'+crypto.createHmac('sha256',env.JWT_SECRET).update(b).digest('base64url'); };
async function request(path,token,body) {
 const t=performance.now(); const r=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const data=await r.json(); if(!r.ok)throw Error(path+' returned '+r.status+' '+(data.error||'request failed')); return {data,ms:performance.now()-t};
}
async function stage(name,fn) {
 const time=Date.now();const outcomes=await Promise.allSettled(identities.map(fn));const failed=outcomes.filter(x=>x.status==='rejected');
 results.push({stage:name,passed:count-failed.length,failed:failed.length,elapsedMs:Date.now()-time,errors:failed.map(x=>x.reason.message)});
 console.log(name,count-failed.length+'/'+count); assert.equal(failed.length,0,name+' failures: '+failed.map(x=>x.reason.message).join('; '));
}
(async()=>{
 await sql`INSERT INTO users ${sql(identities.map(x=>({id:x.userId,phone:prefix+'u'+x.index,name:'Parallel lifecycle user',is_demo:true})))}`;
 await sql`INSERT INTO drivers ${sql(identities.map(x=>({id:x.driverId,phone:prefix+'d'+x.index,name:'Parallel lifecycle driver',is_demo:true,kyc_verified:true,status:'AVAILABLE',last_lat:28.48127,last_lng:79.443282,last_seen_at:new Date()})))}`;
 identities.forEach(x=>{x.ut=sign(x.userId,'user');x.dt=sign(x.driverId,'driver');});
 await stage('Create 50 bookings',async x=>{const r=await request('/api/v1/bookings',x.ut,{emergencyType:'OPD_AMBULANCE',pickupLat:28.48127,pickupLng:79.443282,pickupAddress:'Isolated lifecycle pickup',pickupLandmark:'Test gate '+x.index,dropLat:28.49,dropLng:79.45,dropAddress:'Isolated lifecycle destination',couponCode:'PILOT100'});x.id=r.data.booking.id;x.otp=r.data.booking.rideOtpCode;assert.ok(x.id&&x.otp);});
 await stage('Accept 50 bookings',async x=>{const r=await request('/api/v1/bookings/'+x.id+'/accept',x.dt,{});assert.equal(r.data.booking.driverId,x.driverId);assert.equal(r.data.booking.pickupLandmark,'Test gate '+x.index);assert.ok(!('rideOtpCode' in r.data.booking));});
 await stage('Arrive 50 drivers',async x=>{await request('/api/v1/bookings/'+x.id+'/arrived',x.dt,{});});
 await stage('Verify 50 pickup OTPs',async x=>{const r=await request('/api/v1/bookings/'+x.id+'/pickup',x.dt,{code:x.otp});assert.equal(r.data.booking.status,'PICKED_UP');});
 await stage('Read 50 independent active rides',async x=>{const r=await request('/api/v1/bookings/'+x.id,x.ut);assert.equal(r.data.booking.driverId,x.driverId);assert.equal(r.data.booking.pickupLandmark,'Test gate '+x.index);});
 await stage('Complete 50 rides',async x=>{const r=await request('/api/v1/bookings/'+x.id+'/complete',x.dt,{});assert.equal(r.data.booking.status,'COMPLETED');});
 await stage('Settle 50 launch-offer receipts',async x=>{const r=await request('/api/v1/bookings/'+x.id+'/mark-paid',x.ut,{couponCode:'PILOT100'});assert.equal(r.data.paid.inr,0);});
 await stage('Rate 50 completed rides',async x=>{await request('/api/v1/bookings/'+x.id+'/rate',x.ut,{rating:4});});
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
 if(env.TEST_RESULTS_FILE)fs.writeFileSync(env.TEST_RESULTS_FILE,JSON.stringify({environment:'Isolated deployment containers: 512 MiB and 0.5 CPU each',scope:'50 real HTTP booking lifecycles with isolated identities. Google pickup/drop resolution uses shared coordinates and cache. FCM credentials absent; no physical dispatch or push delivery claimed.',durationSeconds:(Date.now()-started)/1000,results},null,2));
 await sql`UPDATE bookings SET status='CANCELLED' WHERE user_id=ANY(${identities.map(x=>x.userId)}::uuid[]) AND status NOT IN ('COMPLETED','CANCELLED')`;
 await sql`UPDATE drivers SET status='OFFLINE' WHERE id=ANY(${identities.map(x=>x.driverId)}::uuid[])`;
 await sql.end();
});
