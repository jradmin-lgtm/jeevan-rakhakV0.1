function failureResponse(label,status,headers,text,redact){
 if(typeof redact!=='function')throw Error('Failure metadata requires secret redaction');
 const clean=value=>value===null?null:redact(String(value)).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,200);
 const title=text.match(/<title\b[^>]*>([^<]*)/i)?.[1]??null;
 return {label:clean(label),status,htmlTitle:clean(title),server:clean(headers.get('server')),cfRay:clean(headers.get('cf-ray')),renderRouting:clean(headers.get('x-render-routing'))};
}
module.exports={failureResponse};
