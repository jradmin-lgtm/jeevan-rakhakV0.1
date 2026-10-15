const test = require('node:test'), assert = require('node:assert/strict');
const {validateConfig, validateRuntime, percentile, validateAck, expectedBuildForOrigin} = require('./guards.cjs');
const config = () => ({environmentId:'jr-load-example',databaseName:'jr_load_example',apiOrigin:'https://api.example.invalid',socketOrigin:'https://socket.example.invalid',expectedBuild:'a'.repeat(40),rides:50,cycles:120,mapsEnabled:false,maxMapHttpCalls:0,providerQuotaBudgetConfirmed:false,httpP95Ms:2000,gpsP95Ms:1500,deliveryTimeoutMs:15000,isolatedHostingConfirmed:true,outboundNotificationsDisabled:true});
test('requires explicit isolated hosted environment and bounded scope', () => {
  assert.doesNotThrow(()=>validateConfig(config()));
  for(const patch of [{rides:51},{cycles:361},{cycles:0},{isolatedHostingConfirmed:false},{outboundNotificationsDisabled:false},{apiOrigin:'http://api.example.invalid'},{apiOrigin:'https://127.0.0.1'},{apiOrigin:'https://user:password@api.example.invalid'},{apiOrigin:'https://api.example.invalid/path'},{databaseName:'neondb'}]) assert.throws(()=>validateConfig({...config(),...patch}));
});
test('requires dedicated named database, TLS and matching environment confirmation', () => {
  const e={JR_HOSTED_LOAD_CONFIRM:'jr-load-example',JR_HOSTED_LOAD_JWT_SECRET:'test-only-value'.repeat(4),JR_HOSTED_LOAD_DATABASE_URL:'postgresql://test:test@db.example.invalid/jr_load_example?sslmode=require'};
  assert.doesNotThrow(()=>validateRuntime(config(),e));
  for(const patch of [{JR_HOSTED_LOAD_CONFIRM:''},{JR_HOSTED_LOAD_JWT_SECRET:'short'},{JR_HOSTED_LOAD_DATABASE_URL:'postgresql://test:test@db.example.invalid/neondb?sslmode=require'},{JR_HOSTED_LOAD_DATABASE_URL:'postgresql://test:test@db.example.invalid/jr_load_example'}]) assert.throws(()=>validateRuntime(config(),{...e,...patch}));
});
test('maps are opt-in with an explicit 100-request cap and budget acknowledgement', () => {
  assert.throws(()=>validateConfig({...config(),mapsEnabled:true}));
  assert.doesNotThrow(()=>validateConfig({...config(),mapsEnabled:true,maxMapHttpCalls:100,providerQuotaBudgetConfirmed:true}));
});
test('partial ACK accounts for exact retained points without duplicate or cross-ride deletion', () => {
  const points=[{bookingId:'one',ts:1},{bookingId:'one',ts:2}];
  const a={ok:true,expired:0,accepted:1,acknowledged:[points[0]],rejected:[{...points[1],reason:'future_location_fix'}]};
  assert.deepEqual(validateAck(a,points).rejected,['one:2']);
  for(const patch of [{acknowledged:[points[0],points[0]],accepted:2},{rejected:[]},{acknowledged:[{bookingId:'other',ts:1}]},{rejected:[points[0]]},{ok:false}]) assert.throws(()=>validateAck({...a,...patch},points));
});
test('percentiles are nearest-rank and empty samples stay unknown', () => {
  assert.equal(percentile([],0.95),null);assert.equal(percentile(Array.from({length:100},(_,i)=>i+1),.95),95);
});

test('API and socket each require their exact declared build, with compatible legacy default',()=>{
 const c=config();assert.equal(expectedBuildForOrigin(c,c.apiOrigin),c.expectedBuild);assert.equal(expectedBuildForOrigin(c,c.socketOrigin),c.expectedBuild);
 c.expectedSocketBuild='b'.repeat(40);validateConfig(c);assert.equal(expectedBuildForOrigin(c,c.apiOrigin),'a'.repeat(40));assert.equal(expectedBuildForOrigin(c,c.socketOrigin),'b'.repeat(40));
 assert.throws(()=>expectedBuildForOrigin(c,'https://unknown.example.invalid'),/Unknown target/);
 for(const sha of ['',null,'short','z'.repeat(40)])assert.throws(()=>validateConfig({...c,expectedSocketBuild:sha}));
});
