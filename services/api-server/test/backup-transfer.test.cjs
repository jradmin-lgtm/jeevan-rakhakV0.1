const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const source=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/backup.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function runtime({sql,files=[],seed,failUpload=false,failPatch=false,now}={}){
 const queries=[],logs=[],requests=[],timers=[];let snapshots=0;
 const db=sql??{begin:async(mode,fn)=>{snapshots++;const tx=async()=>[];tx.unsafe=async()=>[];return fn(tx)}};
 class Auth{async getClient(){return {getAccessToken:async()=>({token:'isolated-fake-token'})}}}
 const mod={exports:{}};
 const fetch=async(url,init)=>{requests.push({url,init});if(init.method==='PATCH')return {ok:!failPatch,status:failPatch?503:200};if(url.includes('upload/'))return {ok:!failUpload,status:failUpload?503:200};if(url.includes('alt=media'))return {ok:true,json:async()=>seed};const q=new URL(url).searchParams.get('q');return {ok:true,json:async()=>({files:files.filter(f=>!q.includes('appProperties has')||f.appProperties?.jrBackupSource===identity)})}};
 const identity=crypto.createHash('sha256').update('local@127.0.0.1:5449/jr_feedback_20261015').digest('hex');
 vm.runInNewContext(source,{module:mod,exports:mod.exports,Buffer,URL,URLSearchParams,AbortSignal,Date:class extends Date{constructor(...args){super(...(args.length?args:[now??Date.now()]))}static now(){return now??Date.now()}},Map,process:{env:{DATABASE_URL:'postgres://local@127.0.0.1:5449/jr_feedback_20261015',DRIVE_SA_JSON:'{}'}},console:{log:x=>logs.push(x)},setTimeout(fn,ms){const t={fn,ms,unref(){}};timers.push(t);return t},clearTimeout(t){t.cleared=true},fetch,require(name){if(name==='google-auth-library')return {GoogleAuth:Auth};if(name==='node:crypto')return crypto;if(name==='@jr/db')return {sql:db};throw Error(name)}});
 return {...mod.exports,logs,requests,timers,identity,get snapshots(){return snapshots}};
}
const emptySnapshot={takenAt:new Date().toISOString(),formatVersion:2,tables:{documents:[{data:{__bytea__:Buffer.from('saved document').toString('base64')}}]}};
test('previous complete snapshot seeds verified binary cache and rejects malformed bytes',()=>{
 const r=runtime(),cache=new Map();r.cacheSnapshotBlobs(emptySnapshot,cache);assert.equal(cache.size,1);
 assert.throws(()=>r.cacheSnapshotBlobs({...emptySnapshot,tables:{x:[{data:{__bytea__:'not valid'}}]}},cache),/invalid document/);
 assert.throws(()=>r.cacheSnapshotBlobs({...emptySnapshot,formatVersion:1},cache),/formatVersion 2/);
});
test('restart cooldown skips database and schedules remaining six-hour deadline',async()=>{
 const r=runtime(),now=Date.now();const file={id:'current',createdTime:new Date(now-2*3600000).toISOString(),appProperties:{jrBackupSource:r.identity}};
 const s=runtime({files:[file],now});await s.runDatabaseBackup();assert.equal(s.snapshots,0);assert.equal(s.requests.length,1);
 const stop=s.startDatabaseBackups(e=>{throw e});for(let i=0;i<20;i++)await Promise.resolve();assert.equal(s.timers[0].ms,4*3600000);stop();assert.equal(s.timers[0].cleared,true);
});
test('manual force bypasses recent backup cooldown and uploads complete snapshot',async()=>{
 const r=runtime(),file={id:'current',createdTime:new Date().toISOString(),appProperties:{jrBackupSource:r.identity}};
 const s=runtime({files:[file],seed:emptySnapshot});await s.runDatabaseBackup({force:true});assert.equal(s.snapshots,1);assert.ok(s.requests.some(x=>x.url.includes('alt=media')));const upload=s.requests.find(x=>x.url.includes('upload/'));assert.ok(upload.init.body.includes('"formatVersion":2'));assert.ok(upload.init.body.includes('jrBackupTakenAt'));
});
test('stale backup and different source never suppress snapshot; upload failure is loud',async()=>{
 const s=runtime({files:[{id:'other',createdTime:new Date().toISOString(),appProperties:{jrBackupSource:'other-source'}}],seed:emptySnapshot,failUpload:true});
 await assert.rejects(()=>s.runDatabaseBackup(),/HTTP 503/);assert.equal(s.snapshots,1);assert.ok(!s.logs.some(x=>x.includes('backup.uploaded')));
 const r=runtime(),old={id:'stale',createdTime:new Date(Date.now()-7*3600000).toISOString(),appProperties:{jrBackupSource:r.identity}};
 const t=runtime({files:[old],seed:emptySnapshot});await t.runDatabaseBackup();assert.equal(t.snapshots,1);
});
test('local guard refuses overlap; independent simultaneous processes retain bounded duplicate risk',async()=>{
 const a=runtime(),b=runtime();const first=a.runDatabaseBackup();await assert.rejects(()=>a.runDatabaseBackup(),/already running/);const second=b.runDatabaseBackup();await Promise.all([first,second]);
 assert.equal(a.requests.filter(x=>x.url.includes('upload/')).length,1);assert.equal(b.requests.filter(x=>x.url.includes('upload/')).length,1);
});
test('invalid previous snapshot fails loudly before any database backup query',async()=>{
 const r=runtime({files:[{id:'old',createdTime:new Date(0).toISOString()}],seed:{tables:{}}});await assert.rejects(()=>r.runDatabaseBackup(),/formatVersion 2/);assert.equal(r.snapshots,0);
});
function snapshotSql(tables){return {begin:async(mode,fn)=>{
 const tx=async(strings,...values)=>strings.join('').includes('FROM pg_tables')?Object.keys(tables).map(tablename=>({tablename})):[];
 tx.unsafe=async query=>tables[JSON.parse(query.replace('SELECT * FROM ',''))];return fn(tx);
}}}
function priorFile(r,at,extra={}){return {id:'verified-source',createdTime:at,appProperties:{jrBackupSource:r.identity,jrBackupTakenAt:at,...extra}}}
test('canonical full content hash ignores capture time and row/object order, preserves JSON arrays and duplicate rows',()=>{
 const r=runtime(),s={...emptySnapshot,tables:{z:[{b:{y:2,x:1},a:[1,2]},{a:null}],a:[]}};
 const reorder={...s,takenAt:'2000-01-01T00:00:00.000Z',tables:{a:[],z:[{a:null},{a:[1,2],b:{x:1,y:2}}]}};
 assert.equal(r.snapshotDataHash(s),r.snapshotDataHash(reorder));
 assert.notEqual(r.snapshotDataHash(s),r.snapshotDataHash({...s,tables:{...s.tables,z:[{b:{y:2,x:1},a:[2,1]},{a:null}]}}));
 assert.notEqual(r.snapshotDataHash(s),r.snapshotDataHash({...s,tables:{...s.tables,z:[...s.tables.z,{a:null}]}}));
 assert.notEqual(r.snapshotDataHash(s),r.snapshotDataHash({...s,tables:{...s.tables,new_table:[]}}));
});
test('verified unchanged complete snapshot patches metadata only and keeps original capture/creation times',async()=>{
 const now=Date.now(),at=new Date(now-7*3600000).toISOString(),r=runtime(),tables={items:[{id:2,nested:{b:2,a:1}},{id:1,nested:null}]};
 const prior={takenAt:at,formatVersion:2,tables:{items:[{nested:null,id:1},{nested:{a:1,b:2},id:2}]}};
 const s=runtime({now,files:[priorFile(r,at)],seed:prior,sql:snapshotSql(tables)});await s.runDatabaseBackup();
 assert.equal(s.requests.filter(x=>x.url.includes('upload/')).length,0);
 const patch=s.requests.find(x=>x.init.method==='PATCH');assert.ok(patch);const metadata=JSON.parse(patch.init.body);
 assert.deepEqual(Object.keys(metadata),['appProperties']);assert.equal(metadata.appProperties.jrBackupTakenAt,at);assert.equal(metadata.appProperties.jrBackupCheckedAt,new Date(now).toISOString());assert.equal(metadata.appProperties.jrBackupDataHash,s.snapshotDataHash(prior));
 const log=JSON.parse(s.logs.at(-1));assert.equal(log.event,'backup.unchanged');assert.equal(log.createdAt,at);assert.equal(log.snapshotTakenAt,at);assert.equal(log.verifiedUnchangedAt,new Date(now).toISOString());
 assert.ok(!s.logs.some(x=>x.includes('backup.uploaded')));
 const restarted=runtime({now:now+2*3600000,files:[{...priorFile(r,at),appProperties:metadata.appProperties}]});await restarted.runDatabaseBackup();assert.equal(restarted.snapshots,0);assert.equal(restarted.requests.length,1);
 const stop=restarted.startDatabaseBackups(e=>{throw e});for(let i=0;i<30;i++)await Promise.resolve();assert.equal(restarted.timers[0].ms,4*3600000);stop();
});
test('a real content change uploads a complete format2 snapshot, with its new hash',async()=>{
 const now=Date.now(),at=new Date(now-7*3600000).toISOString(),r=runtime(),prior={takenAt:at,formatVersion:2,tables:{items:[{id:1,note:'before'}],empty:[]}};
 const s=runtime({now,files:[priorFile(r,at)],seed:prior,sql:snapshotSql({items:[{id:1,note:'after'}],empty:[]})});await s.runDatabaseBackup();
 assert.equal(s.requests.filter(x=>x.init.method==='PATCH').length,0);const upload=s.requests.find(x=>x.url.includes('upload/'));assert.ok(upload);assert.ok(upload.init.body.includes('"formatVersion":2'));assert.ok(upload.init.body.includes('"empty":[]'));assert.ok(upload.init.body.includes('"note":"after"'));assert.ok(upload.init.body.includes('jrBackupDataHash'));
});
test('identical different-source backup can seed blobs but never suppress a full upload',async()=>{
 const now=Date.now(),at=new Date(now-7*3600000).toISOString(),prior={takenAt:at,formatVersion:2,tables:{}};
 const s=runtime({now,files:[{id:'other',createdTime:at,appProperties:{jrBackupSource:'other-source',jrBackupTakenAt:at,jrBackupCheckedAt:new Date(now).toISOString(),jrBackupDataHash:runtime().snapshotDataHash(prior)}}],seed:prior});await s.runDatabaseBackup();
 assert.equal(s.requests.filter(x=>x.url.includes('upload/')).length,1);assert.equal(s.requests.filter(x=>x.init.method==='PATCH').length,0);
});
test('metadata update failure and corrupt previous data hash fail loudly without success or replacement upload',async()=>{
 const now=Date.now(),at=new Date(now-7*3600000).toISOString(),r=runtime(),prior={takenAt:at,formatVersion:2,tables:{}};
 const s=runtime({now,files:[priorFile(r,at)],seed:prior,failPatch:true});await assert.rejects(()=>s.runDatabaseBackup(),/HTTP 503/);assert.ok(!s.logs.some(x=>/backup\.(unchanged|uploaded)/.test(x)));assert.equal(s.requests.filter(x=>x.url.includes('upload/')).length,0);
 const corrupt=runtime({now,files:[priorFile(r,at,{jrBackupDataHash:'0'.repeat(64)})],seed:prior});await assert.rejects(()=>corrupt.runDatabaseBackup(),/dataHash mismatch/);assert.equal(corrupt.snapshots,0);
 const badAt=runtime({now,files:[priorFile(r,at)],seed:{...prior,takenAt:new Date(now-8*3600000).toISOString()}});await assert.rejects(()=>badAt.runDatabaseBackup(),/takenAt does not match/);assert.equal(badAt.snapshots,0);
});
test('malformed, future or backwards checkedAt cannot extend cooldown; checkedAt requires a hash',async()=>{
 const now=Date.now(),at=new Date(now-7*3600000).toISOString(),r=runtime();
 for(const checked of ['tomorrow','2026-02-30T00:00:00.000Z',new Date(now+120000).toISOString(),new Date(now-8*3600000).toISOString()]){
  const s=runtime({now,files:[priorFile(r,at,{jrBackupCheckedAt:checked,jrBackupDataHash:'a'.repeat(64)})]});await assert.rejects(()=>s.runDatabaseBackup(),/checkedAt/);assert.equal(s.snapshots,0);
 }
 const missing=runtime({now,files:[priorFile(r,at,{jrBackupCheckedAt:new Date(now).toISOString()})]});await assert.rejects(()=>missing.runDatabaseBackup(),/dataHash/);
 const malformed=runtime({now,files:[priorFile(r,'2026-02-30T00:00:00.000Z')]});await assert.rejects(()=>malformed.runDatabaseBackup(),/timestamp/);
});
// This integration test runs only against the named isolated clone and never contacts Drive.
test('actual PostgreSQL full snapshot restores exact binary bytes, reuses them, and fetches changed document only',{skip:!process.env.BACKUP_TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.BACKUP_TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/jr_feedback_20261015');
 const sql=require('../../../packages/db/node_modules/postgres')(url.href,{max:1,onnotice(){}});
 try{
 await sql`CREATE TABLE IF NOT EXISTS backup_transfer_fixture(id text PRIMARY KEY, payload bytea, note text)`;
 const a=crypto.randomBytes(1024*1024),b=crypto.randomBytes(8192);await sql`INSERT INTO backup_transfer_fixture VALUES('a',${a},'fixture'),('b',${b},'fixture'),('null',NULL,'fixture'),('empty',${Buffer.alloc(0)},'fixture') ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload`;
 const r=runtime({sql}),cache=new Map();const first=await r.buildDatabaseSnapshot(cache);const firstStats=JSON.parse(r.logs.at(-1));assert.equal(first.formatVersion,2);assert.ok(first.tables.users&&first.tables.drivers&&first.tables.bookings);const rows=first.tables.backup_transfer_fixture;
 assert.deepEqual(Buffer.from(rows.find(x=>x.id==='a').payload.__bytea__,'base64'),a);assert.equal(rows.find(x=>x.id==='null').payload,null);assert.equal(rows.find(x=>x.id==='empty').payload.__bytea__,'');
 const second=await r.buildDatabaseSnapshot(cache);assert.deepEqual(JSON.parse(JSON.stringify(second.tables.backup_transfer_fixture)),JSON.parse(JSON.stringify(rows)));
 let stats=JSON.parse(r.logs.at(-1));const secondStats=stats;assert.equal(stats.cacheMisses,0);assert.equal(stats.binarySourceBytesFetched,0);assert.ok(stats.binarySourceBytesReused>=a.length+b.length);
 const changed=crypto.randomBytes(4096);await sql`UPDATE backup_transfer_fixture SET payload=${changed} WHERE id='b'`;
 const third=await r.buildDatabaseSnapshot(cache);stats=JSON.parse(r.logs.at(-1));assert.equal(stats.cacheMisses,1);assert.equal(stats.binarySourceBytesFetched,changed.length);assert.deepEqual(Buffer.from(third.tables.backup_transfer_fixture.find(x=>x.id==='b').payload.__bytea__,'base64'),changed);
 const restartCache=new Map();r.cacheSnapshotBlobs(JSON.parse(JSON.stringify(third)),restartCache);await r.buildDatabaseSnapshot(restartCache);assert.equal(JSON.parse(r.logs.at(-1)).cacheMisses,0);
 const restored=Buffer.from(JSON.parse(JSON.stringify(third)).tables.backup_transfer_fixture.find(x=>x.id==='a').payload.__bytea__,'base64');
 await sql`INSERT INTO backup_transfer_fixture(id,payload,note) VALUES('restored',${restored},'restored formatVersion2')`;const [verification]=await sql`SELECT payload FROM backup_transfer_fixture WHERE id='restored'`;assert.deepEqual(verification.payload,a);
 fs.writeFileSync('/tmp/jr-oct15-backup-transfer-evidence.json',JSON.stringify({first:firstStats,unchanged:secondStats,changed:stats,restoreBytesEqual:true,restartMisses:0},null,2));
 const key=crypto.createHash('sha256').update(a).digest('hex')+':'+a.length;restartCache.set(key,a.toString('base64')+'!');await assert.rejects(()=>r.buildDatabaseSnapshot(restartCache),/cache checksum mismatch/);
 }finally{await sql`DROP TABLE IF EXISTS backup_transfer_fixture`;await sql.end()}
});
