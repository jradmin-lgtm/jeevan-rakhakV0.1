"use client";
import React, { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../lib/adminFetch";

type Action = "cancel_trip" | "force_offline" | "release_offline" | "restrict_user" | "restore_user";
export function AdminOperation({action,targetId,label,apiBase,registeredEmail,targetLabel}:{action:Action;targetId:string;label:string;apiBase:string;registeredEmail?:string|null;targetLabel:string}) {
  const router=useRouter();
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [reason,setReason]=useState(""),[password,setPassword]=useState(""),[email,setEmail]=useState("");
  const id=useRef("");
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    try{
      const res=await adminFetch(`${apiBase}/api/v1/admin/operations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id.current,action,targetId,reason,password,...(registeredEmail?{email:email.trim()}: {})})});
      const data=await res.json();
      if(!res.ok)throw new Error(({admin_action_password_required:"Incorrect action password.",registered_email_does_not_match:"Enter this account's registered email exactly.",cancel_active_trip_first:"This driver has an active ride. Resolve or cancel that ride first.",trip_already_finished:"This trip is already finished.",admin_action_password_not_configured:"Administrative action password is not configured."} as Record<string,string>)[data.error] ?? data.error ?? `Action failed (${res.status}).`);
      setPassword("");setReason("");setEmail("");setOpen(false);router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Action failed. Please retry.");}
    finally{setBusy(false);}
  };
  if(!open)return <button className="btn" onClick={()=>{id.current=crypto.randomUUID();setError("");setOpen(true);}}>{label}</button>;
  return <form onSubmit={submit} style={{border:"1px solid var(--border)",background:"var(--surface)",padding:16,borderRadius:10,maxWidth:420,display:"grid",gap:10}}>
    <strong>{label}</strong><p style={{margin:0,fontSize:13}}>{targetLabel}</p>
    <p className="muted" style={{margin:0,fontSize:12}}>{action==="cancel_trip"?"This cancels the active trip. It does not mark arrival, charge payment or issue a refund.":action==="force_offline"?"New offers will be blocked until an administrator releases this hold.":action==="restrict_user"?"This blocks account access. It does not end an existing ride.":action==="release_offline"?"The driver may choose to go online again. This does not put them online automatically.":"This restores account access."}</p>
    {registeredEmail?<label>Confirm registered email<input type="email" autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy}/></label>:null}
    <label>Reason<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={4} maxLength={500} required disabled={busy}/></label>
    <label>Action password<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} maxLength={512} required disabled={busy}/></label>
    {error?<p role="alert" style={{color:"var(--danger)",margin:0}}>{error}</p>:null}
    <div style={{display:"flex",gap:8}}><button type="button" disabled={busy} onClick={()=>{setPassword("");setOpen(false);}}>Cancel</button><button type="submit" disabled={busy}>{busy?"Applying…":`Confirm ${label.toLowerCase()}`}</button></div>
  </form>;
}
