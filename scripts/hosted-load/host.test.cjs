const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {createHost}=require('./host.cjs'),{agentOptions,createTransport}=require('./transport.cjs');
const config={environmentId:'jr-load-example',databaseName:'jr_load_example',apiOrigin:'https://api.example.invalid',socketOrigin:'https://socket.example.invalid',expectedBuild:'a'.repeat(40),rides:50,cycles:360,mapsEnabled:false,maxMapHttpCalls:0,providerQuotaBudgetConfirmed:false,httpP95Ms:2000,gpsP95Ms:1500,deliveryTimeoutMs:15000,isolatedHostingConfirmed:true,outboundNotificationsDisabled:true};
const env={JR_HOSTED_LOAD_CONFIRM:config.environmentId,JR_HOSTED_LOAD_JWT_SECRET:'isolated'.repeat(8),JR_HOSTED_LOAD_DATABASE_URL:'postgres://test:test@db.example.invalid/jr_load_example?sslmode=require',JR_HOSTED_LOAD_CONTROL_SECRET:'control'.repeat(8)};
async function listening(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return 'http://127.0.0.1:'+server.address().port;}
test('control endpoints are private, run starts exactly once, reports stay unavailable until child exits',async t=>{
 let calls=0,report=null;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};
 const server=createHost({config,env,configPath:'/tmp/test-config',reportPath:'/tmp/test-report',readReport:()=>report,spawnRun(binary,args,options){calls++;assert.equal(args[1],'--run');assert.equal(options.env,env);return child;}});t.after(()=>server.close());const origin=await listening(server);
 const auth={authorization:'Bearer '+env.JR_HOSTED_LOAD_CONTROL_SECRET};
 assert.deepEqual(await(await fetch(origin+'/health')).json(),{status:'ok',service:'isolated-load-generator',generatorBuild:'unverified',targetBuild:config.expectedBuild});
 for(const endpoint of ['/run','/status','/report'])assert.equal((await fetch(origin+endpoint,{method:endpoint==='/run'?'POST':'GET'})).status,401);
 assert.equal(calls,0);assert.equal((await fetch(origin+'/run',{method:'POST',headers:auth})).status,202);assert.equal((await fetch(origin+'/run',{method:'POST',headers:auth})).status,409);assert.equal(calls,1);assert.equal((await fetch(origin+'/report',{headers:auth})).status,409);
 const log=JSON.stringify({stage:'steady',cycle:12,totalCycles:360,pendingGps:0});child.stdout.write(log.slice(0,15));child.stdout.write(log.slice(15)+'\n');assert.equal((await(await fetch(origin+'/status',{headers:auth})).json()).progress[0].cycle,12);
 child.stdout.write(JSON.stringify({diagnostic:env.JR_HOSTED_LOAD_DATABASE_URL,token:env.JR_HOSTED_LOAD_JWT_SECRET})+'\n');const redacted=JSON.stringify(await(await fetch(origin+'/status',{headers:auth})).json());assert.ok(!redacted.includes(env.JR_HOSTED_LOAD_DATABASE_URL));assert.ok(!redacted.includes(env.JR_HOSTED_LOAD_JWT_SECRET));
 report=Buffer.from('{"verdict":"PASS"}');child.emit('close',0);assert.equal((await(await fetch(origin+'/report',{headers:auth})).json()).verdict,'PASS');assert.equal((await fetch(origin+'/run',{method:'POST',headers:auth})).status,409);
});
test('host refuses missing control secret or production database configuration before listening',()=>{
 assert.throws(()=>createHost({config,env:{...env,JR_HOSTED_LOAD_CONTROL_SECRET:''}}),/control secret/);
 assert.throws(()=>createHost({config,env:{...env,JR_HOSTED_LOAD_DATABASE_URL:'postgres://test@db.example.invalid/neondb?sslmode=require'}}),/Database name mismatch/);
});
test('transport retains one HTTP connection across an idle gap and keeps fixed phone concurrency limits',async t=>{
 assert.deepEqual({...agentOptions},{connections:100,pipelining:1,keepAliveTimeout:60000,keepAliveMaxTimeout:60000,keepAliveTimeoutThreshold:0});
 let connections=0;const server=http.createServer((req,res)=>res.end('{}'));server.keepAliveTimeout=10000;server.on('connection',()=>connections++);const origin=await listening(server),transport=createTransport();
 t.after(async()=>{await transport.close();await new Promise(resolve=>server.close(resolve));});
 for(let i=0;i<2;i++){const response=await fetch(origin,{dispatcher:transport.dispatcher});await response.json();if(i===0)await new Promise(resolve=>setTimeout(resolve,100));}
 assert.equal(connections,1);assert.ok(transport.summary().requests>=2);
});
test('closing the temporary host terminates its one running child with SIGTERM',async t=>{
 let calls=0;const signals=[],child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=signal=>{signals.push(signal);return true;};
 const server=createHost({config,env,configPath:'/tmp/test-config',reportPath:'/tmp/test-report',readReport:()=>null,spawnRun(){calls++;return child;}});t.after(()=>server.close());const origin=await listening(server),headers={authorization:'Bearer '+env.JR_HOSTED_LOAD_CONTROL_SECRET};
 assert.equal((await fetch(origin+'/run',{method:'POST',headers})).status,202);assert.equal((await fetch(origin+'/run',{method:'POST',headers})).status,409);
 await new Promise(resolve=>server.close(resolve));assert.deepEqual(signals,['SIGTERM']);assert.equal(calls,1);
});
