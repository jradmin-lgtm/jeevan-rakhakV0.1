"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function RequestStatusBanner() {
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  useEffect(() => { setFailed(new Set()); }, [pathname]);
  useEffect(() => {
    const onStatus = (event: Event) => {
      const { requestKey, failed: unavailable } = (event as CustomEvent<{ requestKey: string; failed: boolean }>).detail;
      setFailed(previous => {
        const next = new Set(previous);
        if (unavailable) next.add(requestKey); else next.delete(requestKey);
        return next;
      });
    };
    window.addEventListener("jr:request-status", onStatus);
    return () => window.removeEventListener("jr:request-status", onStatus);
  }, []);
  if (!failed.size) return null;
  return <div role="alert" className="card" style={{ color: "var(--danger)", marginBottom: 16 }}>
    Some information could not be refreshed or saved. Displayed records may be out of date. Check your connection and retry the action. If this continues, sign in again.
  </div>;
}
