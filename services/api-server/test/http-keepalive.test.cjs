const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),Fastify=require('fastify'),http=require('node:http');
function configuredApp(){
 const filename=path.join(__dirname,'../src/main.ts'),source=fs.readFileSync(filename,'utf8');
 const tree=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const declaration=tree.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(tree)==='app'));
 assert.ok(declaration,'Actual startup Fastify declaration required');
 const headers=tree.statements.find(s=>ts.isExpressionStatement(s)&&ts.isBinaryExpression(s.expression)&&s.expression.left.getText(tree)==='app.server.headersTimeout');
 assert.ok(headers,'Actual startup headers timeout assignment required');
 const snippet=ts.transpileModule(declaration.getText(tree)+'\n'+headers.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 return vm.runInNewContext('(()=>{'+snippet+';return app;})()',{Fastify,process:{env:{LOG_LEVEL:'silent'}}});
}
test('actual startup origin timeouts outlive Render75second proxy reuse',async()=>{
 const app=configuredApp();try{await app.ready();assert.equal(app.server.keepAliveTimeout,120000);assert.equal(app.server.headersTimeout,120000);assert.ok(app.server.keepAliveTimeout>75000);assert.ok(app.server.headersTimeout>=app.server.keepAliveTimeout);assert.equal(app.initialConfig.bodyLimit,256*1024);}finally{await app.close();}
});
test('actual configured server reuses a real HTTP connection and retains its header bound',async()=>{
 const app=configuredApp(),agent=new http.Agent({keepAlive:true,maxSockets:1});app.get('/health',async req=>({ok:true,ip:req.ip}));
 try{
  await app.listen({host:'127.0.0.1',port:0});const port=app.server.address().port;
  async function request(){return new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path:'/health',agent,headers:{'x-forwarded-for':'203.0.113.2'}},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,keepAlive:res.headers['keep-alive'],body,reused:req.reusedSocket}));});req.on('error',reject);});}
  const first=await request(),second=await request();assert.equal(first.status,200);assert.equal(second.status,200);assert.deepEqual(JSON.parse(second.body),{ok:true,ip:'203.0.113.2'});assert.match(first.keepAlive,/timeout=120(?:,|$)/);assert.equal(second.reused,true);
 }finally{agent.destroy();await app.close();}
});
module.exports={configuredApp};

function configuredSocketServer(){
 const filename=path.join(__dirname,'../../../services/socket-server/src/server.ts'),source=fs.readFileSync(filename,'utf8');const tree=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const declaration=tree.statements.find(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>d.name.getText(tree)==='httpServer'));
 const assignments=['httpServer.keepAliveTimeout','httpServer.headersTimeout'].map(name=>tree.statements.find(s=>ts.isExpressionStatement(s)&&ts.isBinaryExpression(s.expression)&&s.expression.left.getText(tree)===name));
 const send=tree.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='send');assert.ok(declaration&&send&&assignments.every(Boolean),'Actual socket startup HTTP contract required');
 const snippet=ts.transpileModule([declaration,...assignments,send].map(s=>s.getText(tree)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 return vm.runInNewContext('(()=>{'+snippet+';return httpServer;})()',{createServer:http.createServer,process:{env:{BUILD_SHA:'a'.repeat(40)}},config:{internalApiSecret:'isolated-test-secret'}});
}
test('actual realtime HTTP server retains proxy-safe reuse and internal auth',async()=>{
 const server=configuredSocketServer(),agent=new http.Agent({keepAlive:true,maxSockets:1});
 try{
  assert.equal(server.keepAliveTimeout,120000);assert.equal(server.headersTimeout,120000);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
  async function request(url){return new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path:url,agent},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body,keepAlive:res.headers['keep-alive'],reused:req.reusedSocket}));});req.on('error',reject);});}
  const first=await request('/health'),again=await request('/health'),denied=await request('/internal/emit-to-user');assert.equal(first.status,200);assert.equal(again.reused,true);assert.match(first.keepAlive,/timeout=120(?:,|$)/);assert.equal(JSON.parse(again.body).build,'a'.repeat(40));assert.equal(denied.status,401);assert.equal(JSON.parse(denied.body).error,'unauthorized');
 }finally{agent.destroy();await new Promise(resolve=>server.close(resolve));}
});
