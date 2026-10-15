const fs=require('node:fs'),path=require('node:path'),dc=require('node:diagnostics_channel');
const agentOptions=Object.freeze({connections:100,pipelining:1,keepAliveTimeout:60000,keepAliveMaxTimeout:60000,keepAliveTimeoutThreshold:0});
function loadDependency(name,legacyPath){
 const installed=path.join(__dirname,'node_modules',name);
 if(fs.existsSync(path.join(installed,'package.json')))return require(installed);
 if(legacyPath)return require(legacyPath);
 return require(path.resolve(__dirname,'../../node_modules/.pnpm/undici@6.28.1/node_modules/undici'));
}
function createTransport(){
 const {Agent}=loadDependency('undici');const dispatcher=new Agent(agentOptions);
 const counts={connections:0,requests:0,connectionErrors:0};
 const subscriptions=[['undici:client:connected',()=>counts.connections++],['undici:request:create',()=>counts.requests++],['undici:client:connectError',()=>counts.connectionErrors++]];
 for(const [name,fn]of subscriptions)dc.channel(name).subscribe(fn);
 return {dispatcher,summary:()=>({mode:'bounded persistent HTTP connection pool',...agentOptions,...counts}),async close(){try{await dispatcher.close();}finally{for(const[name,fn]of subscriptions)dc.channel(name).unsubscribe(fn);}}};
}
module.exports={agentOptions,loadDependency,createTransport};
