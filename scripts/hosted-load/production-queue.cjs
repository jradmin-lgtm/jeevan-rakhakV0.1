const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const API_BUILD='5252631d2bac20e4a4a805137dd6692ec3cbfb46';
const SOURCE_SHA256='5df69cfd58fb659b64d76f4fcae62048deac5b0450d57cf5a82946c78c11f469';
function sourcePath(){const packaged=path.join(__dirname,'production-location-queue.ts');return fs.existsSync(packaged)?packaged:path.resolve(__dirname,'../../apps/driver-app/src/locationQueue.ts');}
function prepareSource(source){
 assert.equal(crypto.createHash('sha256').update(source).digest('hex'),SOURCE_SHA256,'Production queue source differs from reviewed API525 companion app');
 const storage='import AsyncStorage from "@react-native-async-storage/async-storage";',api='import { api, getCachedProfile } from "./api";';
 assert.equal(source.split(storage).length,2);assert.equal(source.split(api).length,2);
 const stripped=stripTypeScriptTypes(source.replace(storage,'const AsyncStorage=dependencies.storage;').replace(api,'const {api,getCachedProfile}=dependencies;'),{mode:'strip'});
 const expected=['export async function queueLocation','export async function locationQueueStatus','export function flushLocationQueue'];for(const marker of expected)assert.equal(stripped.split(marker).length,2);
 let transformed=stripped;for(const marker of expected)transformed=transformed.replace(marker,marker.replace('export ',''));assert.ok(!/\b(import|export)\s/.test(transformed));
 return transformed+'\nexports.queueLocation=queueLocation;exports.locationQueueStatus=locationQueueStatus;exports.flushLocationQueue=flushLocationQueue;';
}
const prepared=()=>prepareSource(fs.readFileSync(sourcePath(),'utf8'));
function createQueue({owner,storage,send,code=prepared()}){
 assert.match(owner,/^[a-f0-9-]{36}$/i);let storageErrors=0;const exports={};
 vm.runInNewContext(code,{exports,Error,Date,console:{error(){storageErrors++;}},dependencies:{storage,api:send,getCachedProfile:async()=>({id:owner})}});
 return {...exports,storageErrors:()=>storageErrors};
}
function fileStorage(directory){fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const filename=key=>{assert.match(key,/^jr\.driver\.location-queue(?:\.[a-f0-9-]{36})?$/i);return path.join(directory,key+'.json');};
 return {getItem:async key=>{const p=filename(key);return fs.existsSync(p)?fs.readFileSync(p,'utf8'):null;},setItem:async(key,value)=>{const p=filename(key),tmp=p+'.next';fs.writeFileSync(tmp,value,{mode:0o600});fs.renameSync(tmp,p);},removeItem:async key=>{const p=filename(key);if(fs.existsSync(p))fs.unlinkSync(p);},points(owner){const p=filename('jr.driver.location-queue.'+owner);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')).points:[];}};
}
module.exports={API_BUILD,SOURCE_SHA256,sourcePath,prepareSource,createQueue,fileStorage};
