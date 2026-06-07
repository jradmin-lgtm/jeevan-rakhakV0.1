"use client";

import { useEffect, useRef } from "react";

/**
 * v1.2.4: live session-revocation guard for the hospital portal.
 *
 * Background: requireHospital (api-server, v1.2.1 RBAC fix) re-checks
 * portal_enabled on EVERY call, so an 8h token stops working the moment an
 * admin disables the portal — every data call then returns 403
 * { error: "portal_disabled" }. The individual live components swallow that
 * (keep-last-good), which would leave a revoked operator staring at a stale,
 * authenticated-looking shell.
 *
 * This guard, mounted once in the (hospital) layout, polls the lightweight
 * authenticated /hospital/me endpoint and — on a 403 portal_disabled — lands
 * the user on /hospital-login?disabled=1 (where HospitalLoginForm shows the
 * "portal is currently disabled" notice). Purely additive: it renders nothing
 * and never touches the data flows. The poll + redirect are cleared on unmount.
 */
const CHECK_MS = 15000;

export function HospitalSessionGuard() {
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;

    const check = async () => {
      try {
        const res = await fetch("/api/hospital-proxy/api/v1/hospital/me", { cache: "no-store" });
        if (!aliveRef.current) return;
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          if (data?.error === "portal_disabled") {
            window.location.href = "/hospital-login?disabled=1";
          }
        }
      } catch {
        /* transient/offline — leave the session as-is; next tick re-checks */
      }
    };

    const id = setInterval(check, CHECK_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(id);
    };
  }, []);

  return null;
}
