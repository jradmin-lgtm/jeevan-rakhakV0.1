const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
function loadMaps(fetcher){
 const exports={},landmarks={};new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/landmarks.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(landmarks);
 const db={insert:()=>({values:()=>({onConflictDoUpdate:async()=>{}})})};
 const config={googlePlacesEnabled:true,maps:{google:{apiKey:'test-provider-key'}}};
 const requireMock=n=>n==='@jr/config'?{config}:n==='@jr/db'?{db,apiUsage:{}}:n==='drizzle-orm'?{sql:()=>({})}:n==='./landmarks'?landmarks:(()=>{throw Error('Unexpected module '+n)})();
 new Function('require','exports','fetch',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/google-maps.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(requireMock,exports,fetcher);
 return exports;
}
const response=body=>({ok:true,json:async()=>body});
test('50 parallel rides keep their routes separate, including one provider failure',async()=>{
 let calls=0;const maps=loadMaps(async raw=>{calls++;const u=new URL(raw),lat=Number(u.searchParams.get('origin').split(',')[0]);await new Promise(r=>setTimeout(r,Math.random()*15));if(lat===28.001)return {ok:false,status:429};return response({status:'OK',routes:[{legs:[{distance:{value:lat*1000},duration:{value:600}}],overview_polyline:{points:''}}]})});
 const results=await Promise.all(Array.from({length:50},(_,i)=>maps.getLiveRoute(28+i*.001,79,28.5,79.5)));
 assert.equal(calls,50);for(let i=0;i<50;i++){if(i===1)assert.equal(results[i],null);else assert.equal(results[i].distanceKm,28+i*.001);}
});
test('50 simultaneous fallback searches share one geocode and one nearby request',async()=>{
 let calls=0;const maps=loadMaps(async raw=>{calls++;await new Promise(r=>setTimeout(r,20));if(raw.includes('/geocode/'))return response({status:'ZERO_RESULTS',results:[]});return response({status:'OK',results:[{place_id:'temple',name:'Village temple',types:['point_of_interest'],geometry:{location:{lat:28.48,lng:79.44}}}]})});
 const results=await Promise.all(Array.from({length:50},()=>maps.getNearbyLandmarks(28.48,79.44,'en')));assert.equal(calls,2);assert.ok(results.every(r=>r[0].name==='Village temple'));
});
test('failed landmark lookup is evicted and can recover immediately',async()=>{
 let calls=0;const maps=loadMaps(async()=>++calls<=2?{ok:false,status:503}:response({status:'ZERO_RESULTS',results:[]}));assert.equal(await maps.getNearbyLandmarks(28,79,'en'),null);assert.deepEqual(await maps.getNearbyLandmarks(28,79,'en'),[]);assert.equal(calls,4);
});
test('different pickups and languages never share suggestion results',async()=>{
 const maps=loadMaps(async raw=>{if(raw.includes('/geocode/'))return response({status:'ZERO_RESULTS',results:[]});const u=new URL(raw),[lat,lng]=u.searchParams.get('location').split(',').map(Number),name=u.searchParams.get('language')+lat;return response({status:'OK',results:[{place_id:name,name,types:['point_of_interest'],geometry:{location:{lat,lng}}}]})});
 const r=await Promise.all([maps.getNearbyLandmarks(28,79,'en'),maps.getNearbyLandmarks(29,79,'en'),maps.getNearbyLandmarks(28,79,'hi')]);assert.deepEqual(r.map(x=>x[0].name),['en28','en29','hi28']);
});

test('50 concurrent area requests share one geocode and need no places request',async()=>{
 const sample=require('./fixtures/pickup-areas-google.json')[0];let calls=0;
 const maps=loadMaps(async raw=>{calls++;assert.ok(raw.includes('/geocode/'));await new Promise(r=>setTimeout(r,10));return response({status:'OK',results:sample.results});});
 const results=await Promise.all(Array.from({length:50},()=>maps.getNearbyLandmarks(sample.lat,sample.lng,'en')));
 assert.equal(calls,1);assert.ok(results.every(x=>x.some(y=>y.name==='Bhoji Pura')));
});
test('automatic booking resolution uses the same short area label',async()=>{
 const sample=require('./fixtures/pickup-areas-google.json')[0];const maps=loadMaps(async raw=>response({status:'OK',results:raw.includes('/geocode/')?sample.results:[]}));
 const result=await maps.resolveLocation(sample.lat,sample.lng);assert.ok(['Abheypur Keshonpur','Bhoji Pura'].includes(result.landmark));assert.equal(result.address,sample.results[0].formatted_address);
});
test('malformed geocoding can use real nearby data but never a fabricated area',async()=>{
 const maps=loadMaps(async raw=>raw.includes('/geocode/')?{ok:true,json:async()=>{throw Error('Bad JSON')}}:response({status:'ZERO_RESULTS',results:[]}));assert.deepEqual(await maps.getNearbyLandmarks(28,79,'en'),[]);
});
