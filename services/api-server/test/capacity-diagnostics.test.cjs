const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/capacity-diagnostics.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,mod={exports:{}};
vm.runInNewContext(source,{module:mod,exports:mod.exports,require,process,URL,setInterval,setTimeout,clearInterval,clearTimeout});
const {capacityDiagnosticsEnabled,validateCapacityDiagnostics,readCgroupCounters,startCapacityDiagnostics,createCapacityDiagnosticsLifecycle}=mod.exports;
const missing=()=>{throw Object.assign(Error('fixed path missing'),{code:'ENOENT'})};
function fixture(){let now=0,cpu={user:0,system:0};const intervals=[],timeouts=[],cleared=[],logs=[],files={'/sys/fs/cgroup/cpu.stat':'nr_periods 10\nnr_throttled 2\nthrottled_usec 200\n','/sys/fs/cgroup/cpu.max':'15000 100000'},hist={count:3,max:100000000,enabled:0,disabled:0,resets:0,enable(){this.enabled++},disable(){this.disabled++},percentile(p){return p*1000000},reset(){this.resets++;this.count=0}};let reads=0;
 const deps={read(path){reads++;if(!(path in files))return missing();return files[path]},now:()=>now,cpu:()=>cpu,rss:()=>123456,histogram:()=>hist,every(fn,ms){const timer={fn,ms,unref(){}};intervals.push(timer);return timer},later(fn,ms){const timer={fn,ms,unref(){}};timeouts.push(timer);return timer},clearEvery:t=>cleared.push(t),clearLater:t=>cleared.push(t)};
 return {deps,files,hist,intervals,timeouts,cleared,logs,emit:x=>logs.push(x),get reads(){return reads},tick(ms=5000,user=50000){now+=ms;cpu={user,system:0};intervals[0].fn()}};
}
test('diagnostics are off by default, validate explicit flags and require named load DB when enabled',()=>{
 for(const value of [undefined,'','false','0'])assert.equal(capacityDiagnosticsEnabled(value),false);
 for(const value of ['true','1'])assert.equal(capacityDiagnosticsEnabled(value),true);
 for(const value of ['yes','TRUE',' true '])assert.throws(()=>capacityDiagnosticsEnabled(value),/must be/);
 assert.equal(validateCapacityDiagnostics(undefined,undefined),false);assert.equal(validateCapacityDiagnostics('true','postgres://test@db.neon.tech/jr_load_example'),true);
 for(const url of [undefined,'invalid','postgres://test@db.neon.tech/neondb','postgres://test@db.neon.tech/jr_restore_oct15_v1'])assert.throws(()=>validateCapacityDiagnostics('true',url),/isolated jr_load/);
 const f=fixture();startCapacityDiagnostics(false,f.emit,f.deps)();assert.equal(f.reads,0);assert.equal(f.intervals.length,0);assert.equal(f.timeouts.length,0);assert.equal(f.hist.enabled,0);
});
test('cgroup v2 sample reports actual process, event loop and throttling deltas without request data',()=>{
 const f=fixture(),stop=startCapacityDiagnostics(true,f.emit,f.deps);assert.equal(f.intervals[0].ms,5000);assert.equal(f.timeouts[0].ms,120000);
 f.files['/sys/fs/cgroup/cpu.stat']='nr_periods 20\nnr_throttled 5\nthrottled_usec 800';f.tick();const r=f.logs[0];assert.equal(r.processCpu.cores,.01);assert.equal(r.rssBytes,123456);assert.equal(r.cgroup.limitCores,.15);assert.equal(r.eventLoop.p95Ms,95);assert.equal(r.eventLoop.maxMs,100);assert.equal(r.throttling.periods,10);assert.equal(r.throttling.throttledPeriods,3);assert.equal(r.throttling.throttledMicroseconds,600);assert.equal(f.hist.resets,1);
 stop();stop();assert.equal(f.hist.disabled,1);assert.equal(f.cleared.length,2);const length=f.logs.length;f.tick();assert.equal(f.logs.length,length);
});
test('cgroup v1 nanoseconds convert honestly to microseconds and unlimited quota stays explicit',()=>{
 const files={'/sys/fs/cgroup/cpu/cpu.stat':'nr_periods 12\nnr_throttled 3\nthrottled_time 1234000','/sys/fs/cgroup/cpu/cpu.cfs_quota_us':'-1','/sys/fs/cgroup/cpu/cpu.cfs_period_us':'100000'};
 const r=readCgroupCounters(p=>p in files?files[p]:missing());assert.equal(r.version,'v1');assert.equal(r.throttledMicroseconds,1234);assert.equal(r.limitCores,null);assert.equal(r.limitAvailable,true);
});
test('missing, denied and malformed cgroup data remain unavailable instead of fabricated zeros',()=>{
 assert.equal(readCgroupCounters(missing).reason,'cgroup_paths_not_found');assert.equal(readCgroupCounters(()=>{throw Object.assign(Error('denied'),{code:'EACCES'})}).reason,'EACCES');
 assert.equal(readCgroupCounters(()=>'not valid').reason,'malformed_cgroup_counter');assert.equal(readCgroupCounters(()=>'usage_usec 9').reason,'throttling_counters_not_exposed');
 const r=readCgroupCounters(p=>p.endsWith('cpu.stat')?'nr_periods 1\nnr_throttled 0\nthrottled_usec 0':missing());assert.equal(r.available,true);assert.equal(r.limitAvailable,false);assert.equal(r.limitReason,'ENOENT');
});
test('counter resets and empty histogram are reported as unavailable',()=>{
 const f=fixture(),stop=startCapacityDiagnostics(true,f.emit,f.deps);f.files['/sys/fs/cgroup/cpu.stat']='nr_periods 1\nnr_throttled 0\nthrottled_usec 0';f.hist.count=0;f.tick();assert.equal(f.logs[0].throttling.available,false);assert.equal(f.logs[0].eventLoop.available,false);stop();
});
test('only first application API request arms bounded diagnostics; health requests and later rearm cannot',()=>{
 const f=fixture(),life=createCapacityDiagnosticsLifecycle(true,f.emit,f.deps);for(const url of ['/health','/health/db','/qr'])life.onRequest(url);assert.equal(f.intervals.length,0);
 life.onRequest('/api/v1/bookings/private-fixture-id');assert.equal(f.intervals.length,1);f.tick();assert.ok(!JSON.stringify(f.logs).includes('private-fixture-id'));
 f.timeouts[0].fn();assert.equal(f.hist.disabled,1);assert.equal(f.logs.at(-1).reason,'120_second_duration_limit');life.onRequest('/api/v1/me');life.close();assert.equal(f.intervals.length,1);assert.equal(f.hist.disabled,1);
 const disabled=fixture(),closed=createCapacityDiagnosticsLifecycle(true,disabled.emit,disabled.deps);closed.close();closed.onRequest('/api/v1/me');assert.equal(disabled.intervals.length,0);
});
