/* Executes reviewed companion app logic; no React Native UI or phone storage is simulated. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const HASHES={socket:'e2242a44bf12d90d606d18ff47b96296120fbc7a01795470ed40186de3c3bc8d',tracking:'15886d8cc436c1944d2474cba5ee90ce66c09645f5e25740c4b6dd2e24e16dc2',screen:'87b906849c09e318acf4a49629192ac26e954b5670cceca52f775aececab2a0c'};
function source(kind,role='user'){
 const packaged=path.join(__dirname,kind==='socket'?`production-${role}-socket.ts`:kind==='tracking'?'production-tracking.ts':'production-live-screen.tsx');
 const local=path.resolve(__dirname,kind==='socket'?`../../apps/${role}-app/src/socket.ts`:kind==='tracking'?'../../packages/ui/src/maps/tracking.ts':'../../apps/user-app/src/screens/LiveTrackingScreen.tsx');
 const text=fs.readFileSync(fs.existsSync(packaged)?packaged:local,'utf8');assert.equal(crypto.createHash('sha256').update(text).digest('hex'),HASHES[kind],`Reviewed ${kind} source differs`);return text;
}
function strip(text){return stripTypeScriptTypes(text,{mode:'strip'});}
function once(text,marker){assert.equal(text.split(marker).length,2,'Unique reviewed source marker required');return text.indexOf(marker);}
function slice(text,start,end){return text.slice(once(text,start),once(text,end));}
function createSocketDevice({role,token,origin,io,warn=()=>{}}){
 assert.ok(['user','driver'].includes(role));let text=source('socket',role);const imp='import { SOCKET_BASE, getToken } from "./api";';once(text,imp);text=strip(text.replace(imp,'const {SOCKET_BASE,getToken}=dependencies;'));
 for(const marker of ['export function getSocket','export function disconnectSocket']){once(text,marker);text=text.replace(marker,marker.replace('export ',''));}assert.ok(!/\b(?:import|export)\s/.test(text));
 const exports={};vm.runInNewContext(text+'\nexports.getSocket=getSocket;exports.disconnectSocket=disconnectSocket;',{exports,dependencies:{SOCKET_BASE:origin,getToken:async()=>token},console:{warn:()=>warn()},require:name=>{assert.equal(name,'socket.io-client');return{io};}});return exports;
}
function createUserView({socket,bookingId,getBooking,now=Date.now,onApplied=()=>{},onRefreshError=()=>{}}){
 const track=strip(source('tracking'));let code=track;for(const marker of ['export function newerFix','export function remainingRoute']){once(code,marker);code=code.replace(marker,marker.replace('export ',''));}assert.ok(!/\b(?:import|export)\s/.test(code));const tracking={};vm.runInNewContext(code+'\nexports.newerFix=newerFix;',{exports:tracking,Date});
 let fix=null,refreshErrors=0;const exports={};const screen=source('screen');
 const refresh=slice(screen,'let refreshRunning = false;','    void refreshFromApi();\n    pollRef.current = setInterval(refreshFromApi, 5000);');
 const subscribe=slice(screen,'const listeners: Array<[string, (payload: any) => void]> = [];','      listen("booking:event",');
 const receive=slice(screen,'listen("driver:location:update",','      // v1.0.15: SOS-specific events');
 const setDriverPos=fn=>{const next=fn(fix);if(next!==fix){assert.ok(!fix||next.ts>fix.ts);fix=next;onApplied({...next});}};
 const context={exports,mounted:true,sock:socket,initial:{id:bookingId},bookingsApi:{get:getBooking},setBooking:()=>{},setTrackingError:()=>{},setDriverProfile:()=>{},setDriverPos,newerFix:(current,next)=>tracking.newerFix(current,next,now()),console:{warn:(_message,error)=>{refreshErrors++;onRefreshError(error);}},Date,t:()=> 'refresh_failed'};
 vm.runInNewContext(strip(refresh+'\n'+subscribe+'\n'+receive)+'\nexports.refresh=refreshFromApi;exports.cleanup=()=>{mounted=false;for(const[event,handler]of listeners)sock.off(event,handler);};',context);
 return{refresh:exports.refresh,cleanup:exports.cleanup,latest:()=>fix?{...fix}:null,refreshErrors:()=>refreshErrors};
}
module.exports={HASHES,source,createSocketDevice,createUserView};
