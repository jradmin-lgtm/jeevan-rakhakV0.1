const fs=require('fs'),assert=require('assert/strict'),net=require('net'),{spawn}=require('child_process');
const root=require('path').resolve(__dirname,'../../..'),env=process.env;
if(!env.DATABASE_URL||!['localhost','127.0.0.1','postgres'].includes(new URL(env.DATABASE_URL).hostname))throw Error('Isolated local database required');
const sql=require(root+'/packages/db/node_modules/postgres')(env.DATABASE_URL);
async function availablePort(){const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function main(){
 const [u]=await sql`INSERT INTO users(phone,name)VALUES(${'startup-'+Date.now()},'Startup regression user')RETURNING id`;
 const [b]=await sql`INSERT INTO bookings(user_id,status,emergency_type,is_sos,pickup_lat,pickup_lng,fare_final_inr)VALUES(${u.id},'COMPLETED','CARDIAC',true,28.4,79.4,650)RETURNING id`;
 const port=await availablePort();let log='';
 const child=spawn(process.execPath,['--import','./services/api-server/node_modules/tsx/dist/loader.mjs','services/api-server/src/main.ts'],{cwd:root,env:{...env,API_PORT:String(port),NODE_ENV:'development'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>{log=(log+d).slice(-8000)});child.stderr.on('data',d=>{log=(log+d).slice(-8000)});
 const exited=new Promise(resolve=>child.once('exit',resolve));
 try{
  let ready=false;
  for(let attempt=0;attempt<50;attempt++){
   if(child.exitCode!==null)throw Error('Startup process failed: '+log);
   try{const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(500)});if(response.ok){ready=true;break}}
   catch(error){if(attempt===49)throw Error('Startup did not become ready: '+error.message)}
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  assert.ok(ready,'Second API instance reaches health');
  const [ride]=await sql`SELECT paid_at,paid_inr,fare_final_inr FROM bookings WHERE id=${b.id}`;
  assert.equal(ride.paid_at,null,'Startup must retain unpaid SOS ride');assert.equal(ride.paid_inr,null);assert.equal(ride.fare_final_inr,650);
  const result={name:'API restart preserves completed unpaid ride and recorded fare',pass:true};
  console.log('PASS',result.name);if(env.TEST_RESULTS_FILE)fs.writeFileSync(env.TEST_RESULTS_FILE,JSON.stringify(result,null,2));
 }finally{child.kill('SIGTERM');await exited;}
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>sql.end());
