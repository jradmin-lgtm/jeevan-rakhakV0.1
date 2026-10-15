const test=require('node:test'),assert=require('node:assert/strict');const {measureDatabaseRoundTrips}=require('./database-probe.cjs');
test('database probe performs only111 fixed read-only queries and caps parallel work at20',async()=>{
 let calls=0,active=0,max=0,closed=false;
 const factory=(url,options)=>{assert.equal(options.max,20);return {async unsafe(query){calls++;assert.ok(['SHOW server_version','SELECT 1 AS probe'].includes(query));active++;max=Math.max(max,active);await Promise.resolve();active--;return query.startsWith('SHOW')?[{server_version:'18-test'}]:[{probe:1}];},async end(){closed=true;}};};
 const result=await measureDatabaseRoundTrips(factory,'postgres://synthetic');assert.equal(calls,111);assert.equal(max,20);assert.equal(closed,true);assert.equal(result.sequential.count,10);assert.equal(result.parallelCold.count,20);assert.equal(result.parallelWarm.count,80);assert.equal(result.serverVersion,'18-test');
});
test('database probe fails loudly and releases its pool when a query fails',async()=>{let closed=false;await assert.rejects(()=>measureDatabaseRoundTrips(()=>({unsafe:async()=>{throw Error('isolated connection unavailable')},end:async()=>{closed=true}}),'postgres://synthetic'),/connection unavailable/);assert.equal(closed,true);});
