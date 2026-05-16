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

export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  if (socket) {
    socket.connect();
    return socket;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { io } = require("socket.io-client");
  const token = await getToken();
  socket = io(SOCKET_BASE, {
    auth: token ? { token } : undefined,
    transports: ["websocket"],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
