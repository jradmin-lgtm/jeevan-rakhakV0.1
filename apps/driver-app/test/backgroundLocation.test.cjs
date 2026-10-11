const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), ts=require('typescript');
function runtime() {
 const listeners=new Set(), storage=new Map();let starts=0,stops=0,granted=false;
 const AppState={currentState:'active',addEventListener(_,fn){listeners.add(fn);return {remove(){listeners.delete(fn)}}}};
 const change=state=>{AppState.currentState=state;for(const listener of listeners)listener(state)};
 const Location={Accuracy:{High:1},getForegroundPermissionsAsync:async()=>({granted:true}),getBackgroundPermissionsAsync:async()=>({granted}),requestBackgroundPermissionsAsync:async()=>{granted=true;change('background');return {granted:true}},hasStartedLocationUpdatesAsync:async()=>false,startLocationUpdatesAsync:async()=>{assert.equal(AppState.currentState,'active');starts++},stopLocationUpdatesAsync:async()=>{stops++}};
 const output={};const source=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/backgroundLocation.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const req=name=>{if(name==='react-native')return {AppState};if(name==='expo-location')return Location;if(name==='expo-task-manager')return {defineTask(){}};if(name==='@react-native-async-storage/async-storage')return {getItem:async k=>storage.get(k),setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)};if(name==='./socket')return {};if(name==='./locationQueue')return {};throw Error(name)};
 new Function('exports','require',source)(output,req);
 return {api:output,change,get starts(){return starts},get stops(){return stops},storage};
}
test('background permission Settings return waits for foreground before starting service',async()=>{
 const r=runtime(),pending=r.api.startBackgroundLocationTracking('ride-one');await new Promise(setImmediate);assert.equal(r.starts,0);
 r.change('active');assert.equal(await pending,true);assert.equal(r.starts,1);assert.equal(r.storage.get('jr_active_tracking_booking'),'ride-one');
});
test('ending ride during permission Settings cannot start tracking after return',async()=>{
 const r=runtime(),pending=r.api.startBackgroundLocationTracking('ride-one');await new Promise(setImmediate);await r.api.stopBackgroundLocationTracking();r.change('active');assert.equal(await pending,false);assert.equal(r.starts,0);assert.equal(r.storage.has('jr_active_tracking_booking'),false);
});
