"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch } from "../../lib/adminFetch";
import styles from "./AdminOperation.module.css";

type Action = "cancel_trip" | "force_offline" | "release_offline" | "restrict_user" | "restore_user";
export function AdminOperation({action,targetId,label,apiBase,registeredEmail,targetLabel}:{action:Action;targetId:string;label:string;apiBase:string;registeredEmail?:string|null;targetLabel:string}) {
  const router=useRouter();
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [reason,setReason]=useState(""),[password,setPassword]=useState(""),[email,setEmail]=useState("");
  const id=useRef("");
  const dialog=useRef<HTMLDialogElement>(null), trigger=useRef<HTMLButtonElement>(null);
  const titleId=useId(), descriptionId=useId(), reasonHintId=useId(), reasonId=useId();
  const destructive=["cancel_trip","force_offline","restrict_user"].includes(action);
  const dismiss=()=>{dialog.current?.close();setPassword("");setOpen(false);trigger.current?.focus();};
  useEffect(()=>{if(open){dialog.current?.showModal();dialog.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();}},[open]);
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError("");
    try{
      const res=await adminFetch(`${apiBase}/api/v1/admin/operations`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:id.current,action,targetId,reason,password,...(registeredEmail?{email:email.trim()}: {})})});
      const data=await res.json();
      if(!res.ok)throw new Error(({admin_action_password_required:"Incorrect action password.",registered_email_does_not_match:"Enter this account's registered email exactly.",cancel_active_trip_first:"This driver has an active ride. Resolve or cancel that ride first.",trip_already_finished:"This trip is already finished.",admin_action_password_not_configured:"Administrative action password is not configured."} as Record<string,string>)[data.error] ?? data.error ?? `Action failed (${res.status}).`);
      setReason("");setEmail("");dismiss();router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Action failed. Please retry.");}
    finally{setBusy(false);}
  };
  return <>
    <button ref={trigger} type="button" className={styles.trigger} onClick={()=>{id.current=crypto.randomUUID();setError("");setOpen(true);}}>{label}</button>
    {open?<dialog ref={dialog} className={styles.dialog} onKeyDown={event=>{if(event.key!=="Tab")return;const fields=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')].filter(e=>e.getClientRects().length);const first=fields[0],last=fields[fields.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={event=>{event.preventDefault();if(!busy)dismiss();}} onClick={event=>{if(event.target===event.currentTarget&&!busy)dismiss();}}>
      <form onSubmit={submit} className={styles.form} aria-busy={busy}>
        <header className={styles.header}>
          <div><p className={styles.eyebrow}>Admin action</p><h2 id={titleId}>{label}</h2></div>
          <button type="button" className={styles.close} aria-label="Close confirmation" disabled={busy} onClick={dismiss}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
        </header>
        <div className={styles.context}><span>{action==="cancel_trip"?"Trip":action==="force_offline"||action==="release_offline"?"Driver":"User"}</span><strong>{targetLabel}</strong></div>
        <p id={descriptionId} className={styles.description}>{action==="cancel_trip"?"This cancels the active trip. It does not mark arrival, charge payment or issue a refund.":action==="force_offline"?"New offers will be blocked until an administrator releases this hold.":action==="restrict_user"?"This blocks account access. It does not end an existing ride.":action==="release_offline"?"The driver may choose to go online again. This does not put them online automatically.":"This restores account access."}</p>
        {registeredEmail?<label className={styles.field}>Confirm registered email<input type="email" autoComplete="off" value={email} onChange={e=>setEmail(e.target.value)} required disabled={busy}/></label>:null}
        <div className={styles.field}><label htmlFor={reasonId}>Reason</label><textarea id={reasonId} autoFocus value={reason} onChange={e=>setReason(e.target.value)} minLength={4} maxLength={500} rows={3} required disabled={busy} aria-describedby={reasonHintId}/><span id={reasonHintId} className={styles.hint}>At least 4 characters · {reason.length}/500</span></div>
        <label className={styles.field}>Action password<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} maxLength={512} required disabled={busy}/></label>
        {error?<p role="alert" className={styles.error}>{error}</p>:null}
        <footer className={styles.footer}><button type="button" className={styles.cancel} disabled={busy} onClick={dismiss}>Cancel</button><button type="submit" className={`${styles.confirm} ${destructive?styles.destructive:""}`} disabled={busy}>{busy?"Applying…":`Confirm ${label.toLowerCase()}`}</button></footer>
      </form>
    </dialog>:null}
  </>;
}
