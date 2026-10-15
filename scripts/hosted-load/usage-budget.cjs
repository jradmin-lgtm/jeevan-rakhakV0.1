const assert=require('node:assert/strict');
const STOP_PERCENT=15, LIMITS={'neon-transfer':5,'neon-compute':100,'render-bandwidth':5,'render-hours':750};
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
function reviewMonthlyUsage(snapshot,now=Date.now()){
 assert.ok(snapshot&&Array.isArray(snapshot.errors)&&snapshot.errors.length===0,'Quota readings have errors');
 const at=Date.parse(snapshot.checkedAt);assert.ok(Number.isFinite(at)&&at<=now+10000&&now-at<=120000,'Quota fetch must be current');
 assert.ok(Array.isArray(snapshot.meters)&&snapshot.meters.length===4,'All four quota readings required');
 const meters={};for(const m of snapshot.meters){assert.ok(m&&Object.hasOwn(LIMITS,m.id)&&!meters[m.id],'Duplicate or unknown quota meter');assert.ok(finite(m.used)&&finite(m.limit)&&m.limit===LIMITS[m.id]&&finite(m.percent),'Invalid quota value or changed allowance');assert.ok(Math.abs(m.percent-m.used/m.limit*100)<0.000001,'Quota percentage does not match use');assert.ok(['reported','estimate'].includes(m.kind),'Unknown quota reading kind');assert.ok(m.percent<STOP_PERCENT,'Monthly usage reached15percent');meters[m.id]=m;}
 const room=Math.floor((meters['render-bandwidth'].limit*STOP_PERCENT/100-meters['render-bandwidth'].used)*1e9);
 assert.ok(room>80000000,'30MB test plus50MB safety reserve no longer fits');
 return {stopAtPercent:STOP_PERCENT,remainingRenderToCapBytes:room,testModelBudgetBytes:30000000,safetyReserveBytes:50000000,providerReadingsMayLag:true};
}
function createTrafficBudget(settings){
 if(settings===undefined)return null;
 assert.deepEqual(settings,{maxDecodedHttpBytes:12000000,decodedToWireMultiplier:2,nonHttpReserveBytes:6000000,runModelBudgetBytes:30000000,stopAtPercent:STOP_PERCENT},'Reviewed traffic budget required');
 let httpBytes=0,stopped=false;
 const snapshot=()=>({decodedHttpBytes:httpBytes,modelledWireBytes:httpBytes*2+6000000,modelBudgetBytes:30000000,nonHttpReserveBytes:6000000,stopped,invoiceBytesMeasured:false});
 return {assertCanStart(){if(stopped)throw Object.assign(new Error('Testing stopped at reviewed traffic budget'),{code:'JR_USAGE_BUDGET_STOP'});},consume(n){assert.ok(Number.isSafeInteger(n)&&n>=0,'Invalid byte increment');httpBytes+=n;if(stopped||httpBytes>=12000000){stopped=true;throw Object.assign(new Error('Testing stopped at reviewed traffic budget'),{code:'JR_USAGE_BUDGET_STOP'});}},snapshot};
}
const DEFAULT_TRAFFIC_SETTINGS=Object.freeze({maxDecodedHttpBytes:12000000,decodedToWireMultiplier:2,nonHttpReserveBytes:6000000,runModelBudgetBytes:30000000,stopAtPercent:STOP_PERCENT});
module.exports={STOP_PERCENT,reviewMonthlyUsage,createTrafficBudget,DEFAULT_TRAFFIC_SETTINGS};
