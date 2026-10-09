const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ts=require('../../../node_modules/typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../lib/adminSession.ts'),'utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,crypto:require('node:crypto').webcrypto,TextEncoder,TextDecoder,Uint8Array,btoa,atob,console});
const {createAdminSession,verifyAdminSession}=exportsObject;
const secret='local-test-'+require('node:crypto').randomBytes(32).toString('hex');
test('admin session is unique, signed and expires after eight hours',async()=>{
 const first=await createAdminSession(secret),second=await createAdminSession(secret);
 assert.notEqual(first,second);assert.equal(await verifyAdminSession(first,secret),true);
 assert.equal(await verifyAdminSession(first,secret,Date.now()+8*3600000+1),false);
});
test('altered, malformed, unsigned and wrong-key admin sessions are refused',async()=>{
 const token=await createAdminSession(secret),parts=token.split('.');
 const payload=JSON.parse(Buffer.from(parts[0],'base64url'));payload.expires+=3600000;
 for(const invalid of [undefined,'',secret,'malformed',parts[0],Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+parts[1],'x'.repeat(1025)])assert.equal(await verifyAdminSession(invalid,secret),false);
 assert.equal(await verifyAdminSession(token,'other-local-test-secret'),false);
});
