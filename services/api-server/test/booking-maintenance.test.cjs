const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/booking-maintenance.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime(rows=[]){
 const timers=[],queries=[],hooks=[];let now=1_000_000;
 const app={log:{error() {},info() {}},addHook:(name,fn)=>hooks.push(fn)};
 const mod={exports:{}};
 vm.runInNewContext(source,{module:mod,exports:mod.exports,Date:class extends Date{static now(){return now}},console,WeakMap,setTimeout(fn,ms){const t={fn,ms,cleared:false,unref(){}};timers.push(t);return t},clearTimeout(t){t.cleared=true},require(name){if(name==='@jr/db')return {sql:async (text,...params)=>{queries.push({sql:text.join('?'),params});return text.join('').includes('min(dispatch_started_at)')?[{started_at:rows[0]??null}]:[]}};if(name==='@jr/config')return {config:{bookingTimeoutSec:90}};if(name==='./sos-cascade')return {DISPATCH_WINDOW_MS:230000,stopCascade(){}};if(name==='./push')return {pushToUser:async()=>{}};throw Error(name)}});
 return {...mod.exports,timers,queries,hooks,app,now};
}
test('idle startup performs one recovery read and installs no recurring database timer',async()=>{
 const r=runtime();await r.recoverBookingExpiry(r.app);assert.equal(r.queries.length,1);assert.equal(r.timers.length,0);assert.equal(r.hooks.length,1);
 r.scheduleBookingExpiry(r.app,new Date(r.now));assert.equal(r.hooks.length,1,'first booking after idle startup does not register a late Fastify hook');assert.equal(r.timers[0].ms,231000);
});
test('startup recovers persisted pending work and close cancels it',async()=>{
 const r=runtime([new Date(800000)]);await r.recoverBookingExpiry(r.app);assert.equal(r.timers[0].ms,31000);await r.hooks[0]();assert.equal(r.timers[0].cleared,true);r.scheduleBookingExpiry(r.app,new Date(900000));assert.equal(r.timers.length,1);
});
test('only earliest expiry has a timer; after all pending work finishes it becomes idle',async()=>{
 const r=runtime();await r.recoverBookingExpiry(r.app);r.scheduleBookingExpiry(r.app,new Date(r.now));r.scheduleBookingExpiry(r.app,new Date(r.now+10000));assert.equal(r.timers.length,1);
 r.timers[0].fn();for(let i=0;i<8;i++)await Promise.resolve();assert.equal(r.timers.length,1);assert.equal(r.queries.filter(q=>q.sql.includes('UPDATE bookings')).length,1);assert.equal(r.queries.filter(q=>q.sql.includes('min(dispatch_started_at)')).length,2);
});
