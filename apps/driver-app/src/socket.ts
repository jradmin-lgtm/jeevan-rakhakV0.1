import { SOCKET_BASE, getToken } from "./api";

// IMPORTANT: do NOT statically `import` socket.io-client here.
// engine.io-client@6.x eagerly requires its Node-only transports
// (./transports/polling-xhr.node.js → xmlhttprequest-ssl,
//  ./transports/websocket.node.js → ws), which transitively pull in
// Node core modules (net/tls/stream/crypto). Top-level evaluation of
// that chain in Hermes throws BEFORE AppRegistry can register, which
// shows up as a grey screen + `Registered callable JavaScript modules
// (n = 0)` in logcat. Lazy-loading defers the require until after the
// JS bridge is fully up and the user has navigated past Login.
type Socket = any;

let socket: Socket | null = null;
let connecting: Promise<Socket> | null = null;
let generation = 0;

export function getSocket(): Promise<Socket> {
  if (connecting) return connecting;
  const epoch = generation;
  connecting = (async () => {
    const token = await getToken();
    if (!token || epoch !== generation) throw new Error("Realtime session unavailable");
    if (socket?.auth?.token !== token) { socket?.disconnect(); socket = null; }
    if (!socket) {
      const { io } = require("socket.io-client");
      socket = io(SOCKET_BASE, {
        auth: { token }, transports: ["websocket"], reconnectionAttempts: Infinity,
        reconnectionDelay: 1000, reconnectionDelayMax: 15000, autoConnect: false
      });
      socket.on("connect_error", (error: Error) => console.warn("[realtime] connection unavailable", error.message));
      socket.on("session:error", (event: { error: string }) => console.warn("[realtime] session rejected", event.error));
    }
    if (!socket.connected) socket.connect();
    return socket;
  })().finally(() => { connecting = null; });
  return connecting;
}

export function disconnectSocket() {
  generation += 1;
  if (socket) { socket.disconnect(); socket = null; }
}
