const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const subject={};new Function('exports',ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/landmarks.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(subject);
const {rankNearbyLandmarks}=subject;
const place=(id,offset=0,name='Landmark '+id)=>({place_id:id,name,vicinity:'Bhojipura',types:['point_of_interest'],geometry:{location:{lat:28.48+offset,lng:79.44}}});
test('nearest five real places are sorted within two kilometres',()=>{const result=rankNearbyLandmarks(Array.from({length:8},(_,i)=>place(String(i),i*.001)).reverse(),28.48,79.44);assert.deepEqual(result.map(p=>p.id),['0','1','2','3','4']);assert.equal(result[0].distanceMeters,0);assert.ok(result.every(p=>p.distanceMeters<=2000));});
test('remote, malformed and unrecognised results are excluded',()=>{const result=rankNearbyLandmarks([null,{},place('far',1),{...place('bad'),geometry:{location:{lat:NaN,lng:79}}},{...place('type'),types:['postal_code']},place('ok')],28.48,79.44);assert.deepEqual(result.map(p=>p.id),['ok']);});
test('duplicate ids and normalised names cannot occupy multiple choices',()=>{const result=rankNearbyLandmarks([place('a',0,'Temple'),place('b',.001,' TEMPLE '),place('a',.002,'Other'),place('c',.003,'School')],28.48,79.44);assert.deepEqual(result.map(p=>p.id),['a','c']);});
test('saved labels stay inside the booking field limit',()=>{const result=rankNearbyLandmarks([{...place('x',0,'N'.repeat(300)),vicinity:'A'.repeat(300)}],28.48,79.44);assert.equal(result[0].name.length,160);assert.equal(result[0].label.length,160);});
test('missing nearby places produces an empty list for manual entry',()=>assert.deepEqual(rankNearbyLandmarks([],28.48,79.44),[]));

test('nearby listings for the same campus do not crowd out distinct landmarks',()=>{const result=rankNearbyLandmarks([place('hospital',0,'Hospital'),place('ward',.0001,'Hospital ward'),place('hospital-alias',.0002,'Hospital other name'),place('temple',.002,'Village temple'),place('school',.005,'Village school')],28.48,79.44);assert.deepEqual(result.map(p=>p.id),['hospital','temple','school']);assert.ok(result.every(p=>!('lat' in p)&&!('lng' in p)));});

const {resolvePickupAreas}=subject;
const samples=require('./fixtures/pickup-areas-google.json');
test('real SRMS address data yields villages, not hospital departments or Bareilly',()=>{
 const sample=samples.find(x=>x.name==='srms');const result=resolvePickupAreas(sample.results,sample.lat,sample.lng);
 assert.ok(result.some(x=>x.name==='Abheypur Keshonpur'));assert.ok(result.some(x=>x.name==='Bhoji Pura'));
 assert.ok(result.every(x=>x.label===x.name && x.name!=='Bareilly' && x.distanceMeters<=2000));
});
test('real urban address data prefers the area before the city',()=>{
 const sample=samples.find(x=>x.name==='bareilly');const result=resolvePickupAreas(sample.results,sample.lat,sample.lng);
 assert.ok(result.some(x=>x.name==='Model Town'));assert.ok(result.every(x=>x.name!=='Bareilly'));assert.ok(result.length<=5);
});
test('empty or malformed area data never fabricates a village',()=>{
 assert.deepEqual(resolvePickupAreas([null,{}, {types:['street_address'],address_components:[null]}],28,79),[]);
});
test('postal and district summaries are not pickup areas',()=>{
 const sample=samples[0];const broad=sample.results.filter(x=>x.types.some(t=>t.startsWith('administrative_area')||t==='postal_code'));
 assert.deepEqual(resolvePickupAreas(broad,sample.lat,sample.lng),[]);
});
test('duplicate area names are offered once and far results are excluded',()=>{
 const sample=samples[0];const result=resolvePickupAreas([...sample.results,...sample.results],sample.lat,sample.lng);
 assert.equal(new Set(result.map(x=>x.name)).size,result.length);assert.deepEqual(resolvePickupAreas(sample.results,0,0),[]);
});
test('recognisable places use review count with proximity rather than stars alone',()=>{
 const result=rankNearbyLandmarks([{...place('new',0,'New shop'),rating:5,user_ratings_total:1},{...place('known',.002,'Village temple'),rating:4.1,user_ratings_total:300},place('far',1)],28.48,79.44);
 assert.equal(result[0].name,'Village temple');assert.equal(result[0].label,'Village temple');assert.equal(result.length,2);
});
