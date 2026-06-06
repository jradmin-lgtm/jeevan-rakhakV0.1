"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

/**
 * Hospital portal live-socket provider (CR#3, v1.2.0).
 *
 * Why this shape:
 *  - admin-web is a standalone Next.js app and intentionally does NOT depend on
 *    `socket.io-client` (its only deps are next/react/react-dom). To get a live
 *    channel without adding a bundler dependency, we load the socket.io client
 *    bundle that the socket-server already serves at
 *    `<SOCKET_BASE>/socket.io/socket.io.js` and use the resulting `window.io`.
 *    This is the canonical zero-dependency way to attach a socket.io client to
 *    a page that doesn't bundle one.
 *  - The hospital JWT lives in the HTTP-only `jr-hospital-session` cookie, so it
 *    is NOT readable from the browser. Rather than expose a token-leaking
 *    endpoint, the (hospital) layout reads the cookie server-side and passes the
 *    JWT down as the `token` prop here. The token only ever reaches this client
 *    component as a prop (same trust level as any data the page renders) and is
 *    handed straight to the socket handshake — never logged, never stored.
 *  - The socket-server scopes the hospital to its own room from the verified JWT
 *    claim (role:"hospital" + hospitalId), so a hospital socket only receives
 *    `hospital:booking_update` for its own rides.
 *
 * Consumers call `useHospitalSocket().subscribe(event, handler)` which returns an
 * unsubscribe fn; they MUST call it on unmount (the dashboard / record pages do).
 */

type Handler = (payload: any) => void;

type Ctx = {
  /** Subscribe to a socket event. Returns an unsubscribe function. */
  subscribe: (event: string, handler: Handler) => () => void;
  connected: boolean;
};

const HospitalSocketContext = createContext<Ctx | null>(null);

const SOCKET_BASE =
  process.env.NEXT_PUBLIC_SOCKET_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Load the socket.io client bundle served by the socket-server, once, lazily.
// Resolves to the global `io` factory. Returns null if it can't load (the
// pages then run on their 10s poll fallback alone — no hard failure).
let ioLoader: Promise<any | null> | null = null;
function loadIo(): Promise<any | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as any;
  if (w.io) return Promise.resolve(w.io);
  if (!SOCKET_BASE) return Promise.resolve(null);
  if (ioLoader) return ioLoader;
  ioLoader = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-jr-socket-io]");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).io ?? null));
      existing.addEventListener("error", () => resolve(null));
      return;
    }
    const s = document.createElement("script");
    s.src = `${SOCKET_BASE.replace(/\/$/, "")}/socket.io/socket.io.js`;
    s.async = true;
    s.setAttribute("data-jr-socket-io", "1");
    s.onload = () => resolve((window as any).io ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return ioLoader;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function HospitalSocketProvider({ token, children }: { token: string | null; children: any }) {
  const socketRef = useRef<any>(null);
  const handlersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    void loadIo().then((io) => {
      if (cancelled || !io) return;
      const socket = io(SOCKET_BASE.replace(/\/$/, ""), {
        auth: { token },
        transports: ["websocket"],
        reconnectionAttempts: 10,
        reconnectionDelay: 1500
      });
      socketRef.current = socket;
      socket.on("connect", () => !cancelled && setConnected(true));
      socket.on("disconnect", () => !cancelled && setConnected(false));
      // Re-attach every already-registered handler to the live socket so
      // consumers that mounted before the bundle loaded still receive events.
      handlersRef.current.forEach((set, event) => {
        set.forEach((h) => socket.on(event, h));
      });
    });

    return () => {
      cancelled = true;
      const socket = socketRef.current;
      socketRef.current = null;
      setConnected(false);
      if (socket) {
        try {
          socket.removeAllListeners();
          socket.disconnect();
        } catch {
          /* best-effort teardown */
        }
      }
    };
  }, [token]);

  const subscribe = React.useCallback((event: string, handler: Handler) => {
    let set = handlersRef.current.get(event);
    if (!set) {
      set = new Set();
      handlersRef.current.set(event, set);
    }
    set.add(handler);
    const socket = socketRef.current;
    if (socket) socket.on(event, handler);
    return () => {
      const s = handlersRef.current.get(event);
      if (s) s.delete(handler);
      const sock = socketRef.current;
      if (sock) sock.off(event, handler);
    };
  }, []);

  const value: Ctx = { subscribe, connected };
  return <HospitalSocketContext.Provider value={value}>{children}</HospitalSocketContext.Provider>;
}

export function useHospitalSocket(): Ctx {
  const ctx = useContext(HospitalSocketContext);
  // Safe no-op fallback if a page renders outside the provider (poll-only).
  if (!ctx) {
    return { subscribe: () => () => {}, connected: false };
  }
  return ctx;
}
