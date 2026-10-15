const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/incomingAlerts.ts'), 'utf8'), { compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 } }).outputText;
function runtime(response, session = { token: "synthetic" }) {
  const calls=[]; const module={exports:{}};
  vm.runInNewContext(source,{module,exports:module.exports,Error,require(name){
    if(name==='react-native')return {Platform:{OS:'android'},NativeModules:{JRPriorityAlerts:{configure:async()=>calls.push('configure'),startRequest:async(id,sos)=>calls.push({id,sos})}}};
    if(name==='./api')return {API_BASE:'http://127.0.0.1:4400',getToken:async()=>session.token,api:async(path)=>{assert.equal(path,'/api/v1/driver/incoming');calls.push('verify');return await response;}};
    throw Error('Unexpected import '+name);
  }});
  return {alerts:module.exports,calls};
}
test('same booking ID reoffer starts only after current server offer is confirmed',async()=>{
  const {alerts,calls}=runtime({requests:[{id:'redispatched-ride'}]});
  await alerts.startIncomingAlert('redispatched-ride',true);
  assert.equal(calls[0],'configure');assert.equal(calls[1],'verify');assert.equal(calls[2].id,'redispatched-ride');assert.equal(calls[2].sos,true);
});
test('delayed socket request cannot revive a dismissed offer absent from server',async()=>{
  const {alerts,calls}=runtime({requests:[]});await alerts.startIncomingAlert('old-ride',false);assert.deepEqual(calls,['configure','verify']);
});
test('malformed current offer response fails without starting native playback',async()=>{
  const {alerts,calls}=runtime({requests:null});await assert.rejects(alerts.startIncomingAlert('old-ride',false),/verification unavailable/);assert.equal(calls.length,2);
});

test('account switch while verification is pending cannot start old request playback',async()=>{
  let release;const response=new Promise(resolve=>{release=resolve;});const session={token:'driver-A'};
  const {alerts,calls}=runtime(response,session);const pending=alerts.startIncomingAlert('old-ride',false);
  await new Promise(resolve=>setImmediate(resolve));session.token='driver-B';release({requests:[{id:'old-ride'}]});
  await assert.rejects(pending,/session changed/);assert.deepEqual(calls,['configure','verify']);
});
