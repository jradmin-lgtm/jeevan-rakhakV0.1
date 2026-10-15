const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {validateRuntime}=require('./guards.cjs');
function createHost({config,env,configPath,reportPath,spawnRun=spawn,readReport=()=>fs.existsSync(reportPath)?fs.readFileSync(reportPath):null}){
 validateRuntime(config,env);
 if(!env.JR_HOSTED_LOAD_CONTROL_SECRET||env.JR_HOSTED_LOAD_CONTROL_SECRET.length<32)throw Error('Dedicated test control secret required');
 const expected=crypto.createHash('sha256').update('Bearer '+env.JR_HOSTED_LOAD_CONTROL_SECRET).digest();
 const generatorBuild=env.RENDER_GIT_COMMIT??env.BUILD_SHA??'unverified';
 let state='ready',child,exitCode=null;const progress=[];
 function authorized(req){const actual=crypto.createHash('sha256').update(req.headers.authorization??'').digest();return crypto.timingSafeEqual(expected,actual);}
 const server=http.createServer((req,res)=>{
  const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(req.url==='/health'&&req.method==='GET')return send(200,{status:'ok',service:'isolated-load-generator',generatorBuild,targetBuild:config.expectedBuild,targetSocketBuild:config.expectedSocketBuild??config.expectedBuild});
  if(!authorized(req))return send(401,{error:'unauthorized'});
  if(req.url==='/status'&&req.method==='GET')return send(200,{state,exitCode,progress,generatorBuild,targetBuild:config.expectedBuild,targetSocketBuild:config.expectedSocketBuild??config.expectedBuild,runProtection:'Process and local report only; restart durability is not guaranteed'});
  if(req.url==='/report'&&req.method==='GET'){
   if(state!=='finished')return send(409,{error:'report_not_ready'});
   const report=readReport();if(!report)return send(500,{error:'missing_report'});
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify({...JSON.parse(report),generatorSourceBuild:generatorBuild,targetBuild:config.expectedBuild,targetSocketBuild:config.expectedSocketBuild??config.expectedBuild}));
  }
  if(req.url!=='/run'||req.method!=='POST')return send(404,{error:'not_found'});
  if(state!=='ready'||readReport())return send(409,{error:'run_already_started_or_recorded'});
  state='running';
  try{
   child=spawnRun(process.execPath,[path.join(__dirname,'run.cjs'),'--run',configPath,reportPath],{env,stdio:['ignore','pipe','pipe']});
   function appendLines(){let pending='';return chunk=>{
    pending+=String(chunk);
    if(pending.length>65536){pending='';const row={event:'runner_output_overflow',message:'Oversized diagnostic rejected'};progress.push(row);if(progress.length>100)progress.shift();console.error(JSON.stringify(row));return;}
    let split;
    while((split=pending.indexOf('\n'))>=0){let line=pending.slice(0,split);pending=pending.slice(split+1);if(!line.trim())continue;
     for(const key of ['JR_HOSTED_LOAD_DATABASE_URL','JR_HOSTED_LOAD_JWT_SECRET','JR_HOSTED_LOAD_CONTROL_SECRET'])if(env[key])line=line.split(env[key]).join('[redacted]');
     line=line.replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[redacted JWT]');
     let row;try{row=JSON.parse(line);}catch(error){row={event:'runner_non_json_output',message:'Unexpected diagnostic suppressed; inspect final private report'};console.error(JSON.stringify(row));}
     progress.push(row);if(progress.length>100)progress.shift();
    }
   };}
   child.stdout.on('data',appendLines());child.stderr.on('data',appendLines());
   child.once('error',error=>{state='failed';exitCode=-1;progress.push({event:'spawn_failed',code:error.code??'unknown'});});
   child.once('close',code=>{state='finished';exitCode=code;});
   return send(202,{state});
  }catch(error){state='failed';exitCode=-1;return send(500,{error:'runner_start_failed'});}
 });
 server.on('close',()=>{if(state==='running'&&child)child.kill('SIGTERM');});
 return server;
}
module.exports={createHost};
if(require.main===module){
 const config=JSON.parse(process.env.JR_HOSTED_LOAD_CONFIG_JSON??'null');
 const configPath='/tmp/jr-hosted-load-config.json',reportPath='/tmp/jr-hosted-load-report.json';
 if(!config)throw Error('JR_HOSTED_LOAD_CONFIG_JSON required');
 fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
 const server=createHost({config,env:process.env,configPath,reportPath});
 server.listen(Number(process.env.PORT??10000),'0.0.0.0',()=>console.log(JSON.stringify({event:'load.generator.ready'})));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close());
}
