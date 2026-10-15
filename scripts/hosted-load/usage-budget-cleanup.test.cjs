const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {DEFAULT_TRAFFIC_SETTINGS}=require('./usage-budget.cjs');

test('actual runner cancels owned fixtures after the cap and accounts late in-flight responses',async()=>{
  const config={scenario:'STRICT_BASELINE',environmentId:'jr-load-budget-cleanup',databaseName:'jr_load_budget_cleanup',apiOrigin:'https://api.budget.test',socketOrigin:'https://socket.budget.test',expectedBuild:'a'.repeat(40),rides:10,cycles:12,mapsEnabled:false,maxMapHttpCalls:0,httpP95Ms:2000,gpsP95Ms:1500,deliveryTimeoutMs:15000,isolatedHostingConfirmed:true,outboundNotificationsDisabled:true,providerQuotaBudgetConfirmed:false,usageBudget:{...DEFAULT_TRAFFIC_SETTINGS}};
  const rows={users:[],drivers:[],bookings:[],sos_dispatch_attempts:[]};
  const cleanupQueries=[],events=[],signals=new Map();
  let written,sqlClosed=false,transportClosed=false,acceptRequests=0,actualHttpBytes=0;
  function sql(strings,...values){
    if(!strings.raw)return {rows:strings};
    const query=strings.join('?').replace(/\s+/g,' ').trim();
    if(query.startsWith('SELECT current_database()'))return Promise.resolve([{name:config.databaseName}]);
    if(query.includes('FROM jr_load_environment'))return Promise.resolve([{environment_id:config.environmentId,api_origin:config.apiOrigin,socket_origin:config.socketOrigin,outbound_notifications_disabled:true}]);
    if(query.includes('FROM users WHERE NOT is_demo'))return Promise.resolve([{users:0,drivers:0,bookings:0}]);
    if(query.startsWith('SELECT count(*)::int AS n FROM bookings'))return Promise.resolve([{n:0}]);
    const insertion=query.match(/^INSERT INTO (users|drivers|bookings|sos_dispatch_attempts) /);
    if(insertion){rows[insertion[1]].push(...values[0].rows);return Promise.resolve([]);}
    if(query.startsWith('UPDATE bookings SET')){
      assert.match(query,/WHERE id=ANY\(\?::uuid\[\]\) AND user_id=ANY\(\?::uuid\[\]\) AND is_demo=true/);
      const [ids,users]=values;
      assert.equal(ids.length,10);assert.equal(users.length,10);
      rows.bookings.filter(b=>ids.includes(b.id)&&users.includes(b.user_id)&&b.is_demo).forEach(b=>{b.status='CANCELLED';});
      cleanupQueries.push('owned-bookings');return Promise.resolve([]);
    }
    if(query.startsWith('UPDATE drivers SET')){
      assert.match(query,/WHERE id=ANY\(\?::uuid\[\]\) AND name=\? AND is_demo=true/);
      const [ids,name]=values;
      rows.drivers.filter(d=>ids.includes(d.id)&&d.name===name&&d.is_demo).forEach(d=>{d.status='OFFLINE';});
      cleanupQueries.push('owned-drivers');return Promise.resolve([]);
    }
    throw Error('Unexpected SQL in isolated runner test: '+query);
  }
  sql.begin=async fn=>fn(sql);
  sql.end=async()=>{sqlClosed=true;events.push('sql-closed');};
  const mockProcess={argv:['node','run.cjs','--run','/virtual/config.json','/virtual/report.json'],env:{JR_HOSTED_LOAD_CONFIRM:config.environmentId,JR_HOSTED_LOAD_JWT_SECRET:'isolated-test-only-secret-32-bytes',JR_HOSTED_LOAD_DATABASE_URL:'postgres://test:test@db.budget.test/'+config.databaseName+'?sslmode=require'},once:(name,fn)=>signals.set(name,fn),off:(name)=>signals.delete(name),exitCode:0};
  const mockFs={readFileSync(file){assert.equal(file,'/virtual/config.json');return JSON.stringify(config);},existsSync(){return false;},writeFileSync(file,text,options){assert.equal(file,'/virtual/report.json');assert.equal(options.flag,'wx');assert.equal(options.mode,0o600);written=JSON.parse(text);events.push('report-written');}};
  async function fetch(url,options){
    actualHttpBytes+=options.body===undefined?0:Buffer.byteLength(options.body);
    const pathname=new URL(url).pathname;
    let response;
    if(pathname==='/health')response=JSON.stringify({build:config.expectedBuild});
    else if(pathname==='/health/db')response=JSON.stringify({db:'up'});
    else if(pathname.endsWith('/accept')){
      acceptRequests++;
      const booking=rows.bookings.find(b=>pathname.includes(b.id));assert.ok(booking);
      const attempt=rows.sos_dispatch_attempts.find(a=>a.booking_id===booking.id);assert.ok(attempt);
      response=acceptRequests===1?' '.repeat(12000000):JSON.stringify({booking:{id:booking.id,driverId:attempt.driver_id,status:'ACCEPTED'}});
    }else if(pathname.startsWith('/api/v1/bookings/'))response=JSON.stringify({booking:{pickupAddress:rows.bookings[0].pickup_address}});
    else throw Error('Unexpected HTTP request in isolated runner test');
    const isLate=pathname.endsWith('/accept')&&response.length<12000000;
    return {status:200,headers:new Headers(),async text(){
      // These requests have already reached the transport before the first
      // oversized response stops the run. Their bytes must remain in evidence.
      if(isLate)await new Promise(resolve=>setImmediate(resolve));
      actualHttpBytes+=Buffer.byteLength(response);return response;
    }};
  }
  function isolatedRequire(name){
    if(name==='node:fs')return mockFs;
    if(name==='./transport.cjs')return {loadDependency(name){if(name==='postgres')return()=>sql;if(name==='socket.io-client')return {io(){throw Error('Sockets must not start after budget stop');}};throw Error(name);},createTransport(){return {dispatcher:{},close:async()=>{transportClosed=true;events.push('transport-closed');},summary:()=>({testTransport:true})};}};
    if(name==='./database-probe.cjs')return {measureDatabaseRoundTrips:async()=>({queries:111,isolatedStub:true})};
    return name.startsWith('.')?require(path.resolve(__dirname,name)):require(name);
  }
  const moduleObject={exports:{}};
  const run=vm.compileFunction(fs.readFileSync(path.join(__dirname,'run.cjs'),'utf8')+'\nreturn main();',['require','module','__dirname','process','fetch','console'],{filename:'actual-hosted-runner.cjs'});
  await run(isolatedRequire,moduleObject,__dirname,mockProcess,fetch,{log(){},error(){}});
  assert.equal(rows.users.length,10);assert.equal(rows.drivers.length,10);assert.equal(rows.bookings.length,10);assert.equal(rows.sos_dispatch_attempts.length,10);
  assert.equal(acceptRequests,10,'all acceptance HTTP calls were already in flight');
  assert.deepEqual(cleanupQueries,['owned-bookings','owned-drivers']);
  assert.ok(rows.bookings.every(b=>b.status==='CANCELLED'));assert.ok(rows.drivers.every(d=>d.status==='OFFLINE'));
  assert.equal(written.verdict,'FAIL');assert.equal(written.cleanup,'own_fixtures_inactive_retained_for_evidence');
  assert.equal(written.usageBudget.stopped,true);assert.equal(written.usageBudget.decodedHttpBytes,actualHttpBytes);
  assert.ok(written.usageBudget.decodedHttpBytes>12000000,'late responses remain counted above the stop boundary');
  assert.equal(written.usageBudget.modelledWireBytes,actualHttpBytes*2+6000000);assert.equal(written.usageBudget.invoiceBytesMeasured,false);
  assert.match(written.error,/Testing stopped at reviewed traffic budget/);
  assert.equal(written.stages.length,3);assert.equal(written.stages[2].status,'fail');
  assert.ok(sqlClosed&&transportClosed);assert.deepEqual(events,['sql-closed','transport-closed','report-written']);
  assert.equal(signals.size,0);assert.equal(mockProcess.exitCode,1);
});
