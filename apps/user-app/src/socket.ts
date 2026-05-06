import { io, Socket } from "socket.io-client";
import { SOCKET_BASE, getToken } from "./api";

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket?.connected) return socket;
  if (socket) {
    socket.connect();
    return socket;
  }
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
