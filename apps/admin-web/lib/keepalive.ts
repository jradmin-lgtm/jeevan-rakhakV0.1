export type KeepaliveResult={checkedAt:string;services:{name:string;state:'responding'|'unavailable'|'not configured'}[]};
let cached:{until:number;value:KeepaliveResult}|undefined;
let pending:Promise<KeepaliveResult>|undefined;
export async function getKeepalive():Promise<KeepaliveResult> {
 if(cached&&cached.until>Date.now())return cached.value;
 if(!pending)pending=(async()=>{
  const entries=[['API',process.env.JR_API_BASE_URL??process.env.NEXT_PUBLIC_API_BASE_URL],['Realtime',process.env.JR_SOCKET_BASE_URL??process.env.NEXT_PUBLIC_SOCKET_BASE_URL??process.env.NEXT_PUBLIC_SOCKET_URL]];
  const services=await Promise.all(entries.map(async([name,base])=>{
   if(!base)return{name:name!,state:'not configured' as const};
   try {const url=new URL('/health',base);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('invalid_origin');const r=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000)});await r.body?.cancel();return{name:name!,state:r.ok?'responding' as const:'unavailable' as const};}
   catch{return{name:name!,state:'unavailable' as const};}
  }));
  const value={checkedAt:new Date().toISOString(),services};cached={until:Date.now()+20000,value};return value;
 })().finally(()=>{pending=undefined;});
 return pending;
}
