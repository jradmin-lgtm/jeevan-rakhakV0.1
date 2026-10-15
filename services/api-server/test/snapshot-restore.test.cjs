const {test}=require('node:test'),assert=require('node:assert/strict');
const {guardTarget,topologicalOrder,prepareSnapshot,chunks}=require('../../../scripts/restore-database-snapshot.cjs');
const columns=[{table_name:'docs',column_name:'id',data_type:'uuid',is_generated:'NEVER'},{table_name:'docs',column_name:'data',data_type:'bytea',is_generated:'NEVER'},{table_name:'docs',column_name:'new_flag',data_type:'boolean',is_generated:'NEVER'}];
const snapshot=rows=>({formatVersion:2,takenAt:new Date().toISOString(),tables:{docs:rows}});
test('restore guard rejects ordinary and production databases',()=>{
 const env={NEON_PROJECT_ID:'soft-wave-50441469',DATABASE_URL:'postgres://test@approved.neon.tech/jr_restore_oct15_v1',RESTORE_TARGET_DATABASE:'jr_restore_oct15_v1',EXPECTED_DATABASE_HOST:'approved.neon.tech'};guardTarget(env);
 assert.throws(()=>guardTarget({...env,DATABASE_URL:'postgres://test@approved.neon.tech/neondb'}),/separate rehearsal/);
 assert.throws(()=>guardTarget({...env,NEON_PROJECT_ID:'production'}),/alternate project/);
 assert.throws(()=>guardTarget({...env,EXPECTED_DATABASE_HOST:'different.neon.tech'}),/hostname/);
});
test('foreign keys restore parents before children and refuse cycles or missing parents',()=>{
 assert.deepEqual(topologicalOrder(['events','users','bookings'],[{child:'events',parent:'bookings'},{child:'bookings',parent:'users'}]),['users','bookings','events']);
 assert.throws(()=>topologicalOrder(['a','b'],[{child:'a',parent:'b'},{child:'b',parent:'a'}]),/cycle/);
 assert.throws(()=>topologicalOrder(['a'],[{child:'a',parent:'missing'}]),/missing referenced/);
});
test('binary bytes are exact and new default fields remain omitted',()=>{
 const bytes=Buffer.from([0,255,1,2]);const p=prepareSnapshot(snapshot([{id:'one',data:{__bytea__:bytes.toString('base64')}}]),columns).docs;
 assert.equal(p.rows[0].data,'\\x00ff0102');assert.deepEqual(p.omitted,['new_flag']);assert.equal(p.binary.data.bytes,4);
});
test('missing columns, inconsistent rows and malformed bytes fail before writes',()=>{
 assert.throws(()=>prepareSnapshot(snapshot([{missing:1}]),columns),/Missing target column/);
 assert.throws(()=>prepareSnapshot(snapshot([{id:'one',data:null},{id:'two'}]),columns),/Inconsistent/);
 assert.throws(()=>prepareSnapshot(snapshot([{id:'one',data:{__bytea__:'bad!'}}]),columns),/binary encoding/);
});
test('empty source tables remain present and invalid format is rejected',()=>{
 assert.equal(prepareSnapshot(snapshot([]),columns).docs.rows.length,0);
 assert.throws(()=>prepareSnapshot({...snapshot([]),formatVersion:1},columns),/formatVersion 2/);
});
test('bounded chunks retain every row once, including oversized single document',()=>{
 const rows=Array.from({length:205},(_,id)=>({id,text:'value'}));assert.equal(chunks(rows).length,3);assert.deepEqual(chunks(rows).flat(),rows);
 assert.equal(chunks([{text:'x'.repeat(1100000)},{text:'small'}]).length,2);
});
