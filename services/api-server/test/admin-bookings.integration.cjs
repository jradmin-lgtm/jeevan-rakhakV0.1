const fs = require('fs'), assert = require('assert/strict');
const base = process.env.TEST_API_BASE || 'http://127.0.0.1:4100';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw Error('Local isolated API required');
const headers = {'x-admin-key': process.env.ADMIN_API_KEY};
const results=[];
async function page(params) {
 const r=await fetch(base+'/api/v1/admin/bookings?'+new URLSearchParams(params),{headers});
 assert.equal(r.status,200);return r.json();
}
(async()=>{
 let cursor='',seen=new Set(),total,example;
 do {
  const d=await page({limit:17,...(cursor?{cursor}:{})});total=d.total;example ||= d.bookings[0];
  for(const b of d.bookings){assert.ok(!seen.has(b.id),'No duplicate rows');seen.add(b.id)}
  cursor=d.nextCursor||'';
 }while(cursor);
 assert.ok(total>17,'Requires multi-page fixtures');assert.equal(seen.size,total,'Every record returned exactly once, including sub-millisecond timestamps');
 results.push({name:'Complete stable pagination',pass:true,count:seen.size});
 for(const q of [String(example.displayId),'#'+example.displayId,example.id]){
  const d=await page({q});assert.equal(d.bookings.length,1);assert.equal(d.bookings[0].id,example.id);
 }
 results.push({name:'Displayed number, hash-prefixed number and UUID search',pass:true});
 for(const params of [{cursor:'invalid'},{limit:501}]){const r=await fetch(base+'/api/v1/admin/bookings?'+new URLSearchParams(params),{headers});assert.equal(r.status,400)}
 results.push({name:'Invalid pagination rejected',pass:true});
 console.log(JSON.stringify(results));
 if(process.env.TEST_RESULTS_FILE)fs.writeFileSync(process.env.TEST_RESULTS_FILE,JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
