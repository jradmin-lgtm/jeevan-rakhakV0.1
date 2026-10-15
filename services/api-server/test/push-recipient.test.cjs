const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/push.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime(protocol=2){
 const messages=[],mod={exports:{}},row={t:'isolated-device-token',protocol,lang:'en'};
 const selection={from(){return this},where(){return this},async limit(){return[row]}};
 class GoogleAuth{async getClient(){return {getAccessToken:async()=>({token:'isolated-access-token'})}}}
 vm.runInNewContext(source,{module:mod,exports:mod.exports,process:{env:{FCM_SERVICE_ACCOUNT_JSON:'{"project_id":"isolated-test-project"}'}},console,AbortSignal,fetch:async(url,init)=>{assert.ok(url.startsWith('https://fcm.googleapis.com/'));messages.push(JSON.parse(init.body).message);return {ok:true}},require(name){if(name==='google-auth-library')return {GoogleAuth};if(name==='drizzle-orm')return {eq(){}};if(name==='@jr/db')return {db:{select:()=>selection},drivers:{},users:{}};if(name==='./push-i18n')return {renderPushTemplate:()=>({title:'QA request',body:'QA body'})};throw Error(name)}});
 return {...mod.exports,messages};
}
test('protocol2 request identifies intended driver and remains data-only',async()=>{
 const r=runtime();await r.pushToDriver('driver-a','booking_new',{}, {bookingId:'ride-a',kind:'booking',driverId:'spoofed'});
 assert.equal(r.messages.length,1);const m=r.messages[0];assert.equal(m.data.driverId,'driver-a');assert.equal(m.data.type,'jr_offer');assert.equal(m.data.bookingId,'ride-a');assert.equal(m.notification,undefined);assert.equal(m.android.ttl,'60s');
});
test('driver dismiss identifies recipient while user dismiss stays compatible',async()=>{
 const r=runtime();await r.dismissPushToDriver('driver-a','ride-a');assert.equal(r.messages[0].data.driverId,'driver-a');assert.equal(r.messages[0].data.type,'dismiss');assert.equal(r.messages[0].notification,undefined);
 await r.dismissPushToUser('user-a','ride-a');assert.equal(r.messages[1].data.driverId,undefined);assert.equal(r.messages[1].data.type,'dismiss');
});
test('legacy drivers retain ordinary notification delivery',async()=>{
 const r=runtime(1);await r.pushToDriver('driver-a','sos_new',{}, {bookingId:'ride-a',kind:'sos'});assert.equal(r.messages[0].notification.title,'QA request');assert.equal(r.messages[0].data.type,undefined);assert.equal(r.messages[0].data.driverId,undefined);
});
