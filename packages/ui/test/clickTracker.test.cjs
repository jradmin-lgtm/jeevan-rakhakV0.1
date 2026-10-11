const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/analytics/createClickTracker.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime(){const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,console:{error(){},warn(){}},Error});return module.exports.createClickTracker;}
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
test('offline click retries retain same IDs and never include arbitrary values',async()=>{
 const store=new Map();let offline=true;const sends=[];const create=runtime();
 const tracker=create({getItem:async k=>store.get(k)||null,setItem:async(k,v)=>store.set(k,v)},async()=> 'driver-one',async events=>{sends.push(events);if(offline)throw Error('offline');return{acknowledged:events.map(e=>e.id)};});
 tracker.track('driver.accept');await settle();assert.equal(JSON.parse(store.get('jr.clicks.driver-one')).length,1);offline=false;await tracker.flush();
 assert.equal(sends[0][0].id,sends[1][0].id);assert.deepEqual(Object.keys(sends[1][0]).sort(),['event','id','ts']);assert.equal(JSON.parse(store.get('jr.clicks.driver-one')).length,0);
});
test('analytics is isolated across accounts and failed acknowledgement retains events',async()=>{
 const store=new Map();let owner='one',ack=false;const sent=[];const tracker=runtime()({getItem:async k=>store.get(k)||null,setItem:async(k,v)=>store.set(k,v)},async()=>owner,async events=>{sent.push(events);return{acknowledged:ack?events.map(e=>e.id):[]};});
 tracker.track('home.book');await settle();owner='two';await tracker.flush();assert.equal(sent.length,1);assert.equal(JSON.parse(store.get('jr.clicks.one')).length,1);
 owner='one';ack=true;await tracker.flush();assert.equal(JSON.parse(store.get('jr.clicks.one')).length,0);
});
test('new clicks during an upload survive acknowledgement of the earlier batch',async()=>{
 const store=new Map();let release;let first=true;const gate=new Promise(r=>release=r);
 const tracker=runtime()({getItem:async k=>store.get(k)||null,setItem:async(k,v)=>store.set(k,v)},async()=> 'one',async events=>{if(first){first=false;await gate;}return{acknowledged:events.map(e=>e.id)};});
 tracker.track('home.book');await settle();tracker.track('home.sos');await settle();release();await settle();await tracker.flush();assert.equal(JSON.parse(store.get('jr.clicks.one')).length,0);
});
