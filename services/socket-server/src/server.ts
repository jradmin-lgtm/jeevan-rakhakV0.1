import { createServer, IncomingMessage, ServerResponse } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { config } from "@jr/config";
import { db, drivers } from "@jr/db";

type JwtPayload = {
  sub: string;
  role: "user" | "driver" | "admin";
  phone: string;
};

const drivers_room = "drivers:available";
const userRoom = (userId: string) => `user:${userId}`;
const bookingRoom = (id: string) => `booking:${id}`;

const httpServer = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "socket-server" }));
    return;
  }

  // Internal endpoints used by api-server fan-out (auth via shared secret).
  if (req.url === "/internal/booking-created" && req.method === "POST") {
    return readJson(req, res, async (body) => {
      if (req.headers["x-internal"] !== config.jwtSecret) {
        return send(res, 401, { error: "unauthorized" });
      }
      io.to(drivers_room).emit("booking:offered", { bookingId: body.bookingId });
      send(res, 204, null);
    });
  }
  if (req.url === "/internal/booking-event" && req.method === "POST") {
    return readJson(req, res, async (body) => {
      if (req.headers["x-internal"] !== config.jwtSecret) {
        return send(res, 401, { error: "unauthorized" });
      }
      io.to(bookingRoom(body.bookingId)).emit("booking:event", body);
      send(res, 204, null);
    });
  }
  res.writeHead(404);
  res.end("not found");
});

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body == null ? "" : JSON.stringify(body));
}

function readJson(req: IncomingMessage, res: ServerResponse, fn: (body: any) => void) {
  let buf = "";
  req.on("data", (c) => (buf += c));
  req.on("end", () => {
    try {
      fn(buf ? JSON.parse(buf) : {});
    } catch {
      send(res, 400, { error: "bad_json" });
    }
  });
}

const io = new Server(httpServer, {
  cors: { origin: "*" },
  pingInterval: 25000,
  pingTimeout: 60000
});

// JWT auth on the handshake. Tokens come from /api/v1/auth/verify-otp on api-server.
io.use((socket, next) => {
  const auth = (socket.handshake.auth?.token ??
    socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "")) as string | undefined;
  if (!auth) return next(new Error("missing_token"));
  try {
    const decoded = jwt.verify(auth, config.jwtSecret) as JwtPayload;
    (socket as any).user = decoded;
    next();
  } catch {
    next(new Error("invalid_token"));
  }
});

io.on("connection", async (socket: Socket) => {
  const user = (socket as any).user as JwtPayload;
  console.log(`[socket] ${user.role}:${user.sub} connected (${socket.id})`);

  if (user.role === "user") {
    socket.join(userRoom(user.sub));
  }

  if (user.role === "driver") {
    // Drivers default to listening for offered bookings; they can opt out via availability event.
    socket.join(drivers_room);
  }

  socket.on("driver:availability", async (payload: { available: boolean; lat?: number; lng?: number }) => {
    if (user.role !== "driver") return;
    if (payload.available) {
      socket.join(drivers_room);
    } else {
      socket.leave(drivers_room);
    }
    try {
      await db
        .update(drivers)
        .set({
          status: payload.available ? "AVAILABLE" : "OFFLINE",
          lastLat: payload.lat,
          lastLng: payload.lng,
          lastSeenAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(drivers.id, user.sub));
    } catch (err) {
      console.warn("[socket] availability persist failed", err);
    }
  });

  // User subscribes to booking-specific channel after creating a booking.
  socket.on("booking:subscribe", (payload: { bookingId: string }) => {
    if (!payload?.bookingId) return;
    socket.join(bookingRoom(payload.bookingId));
  });

  socket.on("booking:unsubscribe", (payload: { bookingId: string }) => {
    if (!payload?.bookingId) return;
    socket.leave(bookingRoom(payload.bookingId));
  });

  socket.on(
    "driver:location",
    async (payload: {
      bookingId?: string;
      lat: number;
      lng: number;
      speedKmh?: number;
      headingDeg?: number;
    }) => {
      if (user.role !== "driver") return;
      // Live relay to the user listening on the booking room.
      if (payload.bookingId) {
        io.to(bookingRoom(payload.bookingId)).emit("driver:location:update", {
          bookingId: payload.bookingId,
          lat: payload.lat,
          lng: payload.lng,
          speedKmh: payload.speedKmh,
          headingDeg: payload.headingDeg,
          ts: Date.now()
        });
      }
    }
  );

  socket.on("disconnect", () => {
    console.log(`[socket] ${user.role}:${user.sub} disconnected`);
  });
});

httpServer.listen(config.socketPort, "0.0.0.0", () => {
  console.log(`[socket-server] listening on :${config.socketPort}`);
});
