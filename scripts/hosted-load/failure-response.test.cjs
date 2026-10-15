const test=require('node:test'),assert=require('node:assert/strict');const {failureResponse}=require('./failure-response.cjs');
test('502 metadata is restricted to the title and explicitly allowed response headers',()=>{
 const headers=new Headers({server:'cloudflare','cf-ray':'synthetic-ray','x-render-routing':'synthetic-route',authorization:'Bearer private-token','set-cookie':'private-cookie','x-private':'hidden'});
 const html='<html><head><title>Bad gateway</title></head><body>private-body '+ 'x'.repeat(250000)+'</body></html>';
 const result=failureResponse('pickup',502,headers,html,x=>x);assert.deepEqual(result,{label:'pickup',status:502,htmlTitle:'Bad gateway',server:'cloudflare',cfRay:'synthetic-ray',renderRouting:'synthetic-route'});
 const output=JSON.stringify(result);for(const secret of ['private-token','private-cookie','private-body','hidden','<html>'])assert.ok(!output.includes(secret));
});
test('failure titles and header values are bounded and use the provided secret redactor',()=>{
 const result=failureResponse('private-secret\n'+'l'.repeat(300),502,new Headers({server:'private-secret'}),'<title>private-secret\n'+'x'.repeat(1000)+'</title>',x=>x.replaceAll('private-secret','[redacted]'));
 assert.ok(result.label.startsWith('[redacted] '));assert.equal(result.label.length,200);assert.ok(result.htmlTitle.startsWith('[redacted] '));assert.equal(result.htmlTitle.length,200);assert.equal(result.server,'[redacted]');assert.equal(result.cfRay,null);assert.ok(!JSON.stringify(result).includes('private-secret'));
});
test('nonHTML failures retain no body and missing redaction fails loudly',()=>{
 assert.equal(failureResponse('gps',500,new Headers(),'sensitive JSON body',x=>x).htmlTitle,null);
 assert.throws(()=>failureResponse('gps',502,new Headers(),'<title>secret</title>'),/requires secret redaction/);
});
