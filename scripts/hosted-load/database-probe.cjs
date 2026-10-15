const {percentile}=require('./guards.cjs');
function summary(values){return {count:values.length,p50:percentile(values,.5),p95:percentile(values,.95),max:Math.max(...values)};}
async function measureDatabaseRoundTrips(postgres,url){
 const probe=postgres(url,{max:20,prepare:false,connect_timeout:10,idle_timeout:10,ssl:{rejectUnauthorized:true},connection:{statement_timeout:5000,application_name:'jr-hosted-db-probe'}});
 const sequential=[],cold=[],warm=[];
 try{
  const [version]=await probe.unsafe('SHOW server_version');
  async function once(target){const at=performance.now();await probe.unsafe('SELECT 1 AS probe');target.push(performance.now()-at);}
  for(let index=0;index<10;index++)await once(sequential);
  for(let wave=0;wave<5;wave++)await Promise.all(Array.from({length:20},()=>once(wave===0?cold:warm)));
  return {kind:'Read-only SQL round-trip including client/network/pool overhead; not server execution time',queries:111,parallelConnections:20,serverVersion:version.server_version,sequential:summary(sequential),parallelCold:summary(cold),parallelWarm:summary(warm)};
 }finally{await probe.end({timeout:5});}
}
module.exports={measureDatabaseRoundTrips};
