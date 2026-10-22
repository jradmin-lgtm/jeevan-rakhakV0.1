'use strict';
const {parentPort}=require('node:worker_threads'),codec=require('../../../../packages/utils/backupCodec.cjs');
if(!parentPort)throw Error('Isolated heavy fixture requires a worker');
const source='a'.repeat(64),tables={documents:Array.from({length:192},(_,i)=>({id:i,data:{__bytea__:Buffer.alloc(65536,1+i%250).toString('base64')}})),rows:[{id:1,state:'before'}]},base={formatVersion:2,takenAt:'2026-01-01T00:00:00.000Z',tables};
const current={...base,takenAt:'2026-01-02T00:00:00.000Z',tables:{...tables,rows:[{id:1,state:'after'}]}},patch=codec.createIncrement(base,current,{parentFileId:'local_base',source,parentDepth:0}),rebuilt=codec.applyIncrement(base,patch,source),next={...rebuilt,takenAt:'2026-01-03T00:00:00.000Z',tables:{...rebuilt.tables,rows:[{id:1,state:'next'}]}},second=codec.createIncrement(rebuilt,next,{parentFileId:'local_delta',source,parentDepth:1});
if(codec.snapshotDataHash(codec.applyIncrement(rebuilt,second,source))!==codec.snapshotDataHash(next))throw Error('Second incremental reconstruction failed');
parentPort.postMessage({type:'ready',cycles:2,snapshotBytes:Buffer.byteLength(JSON.stringify(base)),incrementBytes:Buffer.byteLength(JSON.stringify(second))});
parentPort.on('message',message=>{if(message!=='stop')throw Error('Unexpected fixture control');parentPort.close();});
