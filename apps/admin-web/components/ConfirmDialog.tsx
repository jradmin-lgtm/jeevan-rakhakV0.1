"use client";

import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";

type Confirm = (message: string) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  const titleId = useId(), bodyId = useId();
  const finish = useCallback((accepted: boolean) => {
    dialog.current?.close();
    resolve.current?.(accepted);
    resolve.current = null;
    setMessage(null);
  }, []);
  const confirm = useCallback<Confirm>((text) => new Promise<boolean>((done) => {
    if (resolve.current) { done(false); return; }
    resolve.current = done;
    setMessage(text);
  }), []);
  useEffect(() => {
    if (message !== null && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [message]);
  useEffect(() => () => { resolve.current?.(false); }, []);
  return <ConfirmContext.Provider value={confirm}>
    {children}
    <dialog ref={dialog} className="jr-confirm-dialog" aria-labelledby={titleId} aria-describedby={bodyId}
      onCancel={(event) => { event.preventDefault(); finish(false); }}
      onClick={(event) => { if (event.target === event.currentTarget) finish(false); }}>
      <div onClick={event => event.stopPropagation()}>
        <h2 id={titleId} style={{ margin: "0 0 12px", fontSize: 22 }}>Confirm action</h2>
        <p id={bodyId} style={{ lineHeight: 1.6, margin: "0 0 24px" }}>{message}</p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <button autoFocus onClick={() => finish(false)} className="jr-confirm-cancel">Cancel</button>
          <button onClick={() => finish(true)} className="jr-confirm-accept">Confirm</button>
        </div>
      </div>
    </dialog>
  </ConfirmContext.Provider>;
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("ConfirmDialogProvider is required");
  return confirm;
}
