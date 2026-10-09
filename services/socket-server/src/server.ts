import { createServer, IncomingMessage, ServerResponse } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { and, eq, inArray } from "drizzle-orm";
import { config } from "@jr/config";
import { bookings, db, drivers, users, hospitals } from "@jr/db";

type JwtPayload = {
  sub: string;
  role: "user" | "driver" | "admin" | "hospital";
  phone: string;
  exp: number;
  hospitalId?: string;
};

const drivers_room = "drivers:available";
const userRoom = (userId: string) => `user:${userId}`;
const bookingRoom = (id: string) => `booking:${id}`;
// v1.0.15: per-driver room so the SOS cascade engine can push to one driver
// at a time. Each connected driver auto-joins this on handshake; api-server's
// cascade engine targets it via POST /internal/emit-to-driver.
const driverRoom = (driverId: string) => `driver:${driverId}`;
// v1.2.0 (CR#3): per-hospital room so the hospital portal receives live
// booking-lifecycle updates for rides destined to it. A connected hospital
// socket auto-joins this on handshake (scope taken from the verified JWT
// claim, never from query params); api-server fans out via
// POST /internal/emit-to-hospital.
const hospitalRoom = (hospitalId: string) => `hospital:${hospitalId}`;

const httpServer = createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "socket-server", build: process.env.RENDER_GIT_COMMIT ?? process.env.BUILD_SHA ?? "local" }));
    return;
  }

  if (req.url?.startsWith("/internal/") && req.headers["x-internal"] !== config.internalApiSecret) return send(res, 401, { error: "unauthorized" });

  // Internal endpoints used by api-server fan-out (auth via shared secret).
  if (req.url === "/internal/booking-created" && req.method === "POST") {
    return readJson(req, res, async (body) => {
      if (req.headers["x-internal"] !== config.internalApiSecret) {
        return send(res, 401, { error: "unauthorized" });
      }
      io.to(drivers_room).emit("booking:offered", { bookingId: body.bookingId });
      send(res, 204, null);
    });
  }
  if (req.url === "/internal/booking-event" && req.method === "POST") {
    return readJson(req, res, async (body) => {
      if (req.headers["x-internal"] !== config.internalApiSecret) {
        return send(res, 401, { error: "unauthorized" });
      }
      io.to(bookingRoom(body.bookingId)).emit("booking:event", body);
      send(res, 204, null);
    });
  }
  // v1.0.15: targeted emission for SOS cascade. body shape:
  //   { driverId?: string, userId?: string, event: string, payload: any }
  // Exactly one of driverId/userId must be set. Used by api-server's cascade
  // engine to push 'sos:incoming' / 'sos:cancelled' to one driver, and to
  // notify the patient 'sos:cascade_exhausted' / 'sos:assigned'.
  if (req.url === "/internal/emit-to-driver" && req.method === "POST") {
    return readJson(req, res, async (body) => {
      if (req.headers["x-internal"] !== config.internalApiSecret) {
        return send(res, 401, { error: "unauthorized" });
      }
      if (!body?.driverId || !body?.event) {
        return send(res, 400, { error: "bad_request" });
      }
      io.to(driverRoom(body.driverId)).emit(body.event, body.payload ?? {});
      send(res, 204, null);
    });
  }
  if (req.url === "/internal/emit-to-user" && req.method === "POST") {
    return readJson(req, res, async (body) => {
      if (req.headers["x-internal"] !== config.internalApiSecret) {
        return send(res, 401, { error: "unauthorized" });
      }
      if (!body?.userId || !body?.event) {
        return send(res, 400, { error: "bad_request" });
      }
      io.to(userRoom(body.userId)).emit(body.event, body.payload ?? {});
      send(res, 204, null);
    });
  }
  // v1.2.0 (CR#3): hospital-portal fan-out. body shape:
  //   { hospitalId: string, event: string, payload?: any }
  // api-server posts here on booking lifecycle events for rides destined to
  // the hospital so the portal updates live without polling.
  if (req.url === "/internal/emit-to-hospital" && req.method === "POST") {
    return readJson(req, res, async (body) => {
      if (req.headers["x-internal"] !== config.internalApiSecret) {
        return send(res, 401, { error: "unauthorized" });
      }
      if (!body?.hospitalId || !body?.event) {
        return send(res, 400, { error: "bad_request" });
      }
      io.to(hospitalRoom(body.hospitalId)).emit(body.event, body.payload ?? {});
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

function readJson(req: IncomingMessage, res: ServerResponse, fn: (body: any) => void | Promise<void>) {
  let buf = "";
  let tooLarge = false;
  req.on("data", (c) => {
    if (tooLarge) return;
    buf += c;
    if (Buffer.byteLength(buf) > 64 * 1024) { tooLarge = true; send(res, 413, { error: "payload_too_large" }); }
  });
  req.on("end", () => {
    if (tooLarge) return;
    try {
      Promise.resolve(fn(buf ? JSON.parse(buf) : {})).catch((err) => { console.error("[socket] internal handler failed", err); if (!res.writableEnded) send(res, 500, { error: "internal_error" }); });
    } catch {
      send(res, 400, { error: "bad_json" });
    }
  });
}

const io = new Server(httpServer, {
  cors: { origin: "*" },
  maxHttpBufferSize: 16 * 1024,
  pingInterval: 25000,
  pingTimeout: 60000
});

const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
async function verifyAccount(user: JwtPayload) {
  if (!validId(user.sub) || !Number.isFinite(user.exp) || user.exp * 1000 <= Date.now()) throw new Error("invalid_identity");
  if (user.role === "user") {
    const [row] = await db.select({ disabled: users.disabled }).from(users).where(eq(users.id, user.sub)).limit(1);
    if (!row || row.disabled) throw new Error("account_unavailable");
    return false;
  }
  if (user.role === "driver") {
    const [row] = await db.select({ disabled: drivers.disabled, verified: drivers.kycVerified, status: drivers.status }).from(drivers).where(eq(drivers.id, user.sub)).limit(1);
    if (!row || row.disabled) throw new Error("account_unavailable");
    return row.verified && row.status === "AVAILABLE";
  }
  if (user.role === "hospital" && user.hospitalId === user.sub) {
    const [row] = await db.select({ enabled: hospitals.portalEnabled, password: hospitals.portalPasswordHash }).from(hospitals).where(eq(hospitals.id, user.sub)).limit(1);
    if (!row?.enabled || !row.password) throw new Error("portal_disabled");
    return false;
  }
  throw new Error("unsupported_role");
}

io.use(async (socket, next) => {
  const auth = socket.handshake.auth?.token ?? socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (typeof auth !== "string") return next(new Error("missing_token"));
  try {
    const decoded = jwt.verify(auth, config.jwtSecret, { algorithms: ["HS256"] }) as JwtPayload;
    socket.data.available = await verifyAccount(decoded);
    socket.data.user = decoded;
    next();
  } catch (error) {
    console.warn("[socket] account authentication rejected", error instanceof Error ? error.message : "unknown error");
    next(new Error("account_authentication_failed"));
  }
});

io.on("connection", async (socket: Socket) => {
  const user = socket.data.user as JwtPayload;
  let windowStart = Date.now(), packets = 0;
  socket.use((_packet, next) => {
    if (Date.now() - windowStart > 10_000) { windowStart = Date.now(); packets = 0; }
    if (++packets > 60) { socket.emit("session:error", { error: "rate_limit" }); socket.disconnect(true); return; }
    next();
  });
  const expiry = setTimeout(() => { socket.emit("session:error", { error: "token_expired" }); socket.disconnect(true); }, Math.min(user.exp * 1000 - Date.now(), 2_147_000_000));
  let checking = false;
  const access = setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      const available = await verifyAccount(user);
      if (user.role === "driver") {
        if (available) socket.join(drivers_room); else socket.leave(drivers_room);
      }
    } catch (error) {
      console.warn("[socket] session access revoked", error instanceof Error ? error.message : "unknown error");
      socket.emit("session:error", { error: "account_unavailable" }); socket.disconnect(true);
    } finally { checking = false; }
  }, 60_000);
  let lastLocation = 0, lastAvailability = 0;
  console.log(`[socket] ${user.role}:${user.sub} connected (${socket.id})`);

  if (user.role === "user") {
    socket.join(userRoom(user.sub));
  }

  if (user.role === "driver") {
    // Drivers default to listening for offered bookings; they can opt out via availability event.
    if (socket.data.available) socket.join(drivers_room);
    // v1.0.15: per-driver room for targeted SOS cascade pushes from api-server.
    // Cascade engine emits 'sos:incoming' here when this driver's wave fires.
    socket.join(driverRoom(user.sub));
  }

  // v1.2.0 (CR#3): hospital portal sockets join their own room so they
  // receive live booking-lifecycle updates for rides destined to them. The
  // scope comes from the verified JWT claim, never from a query param — a
  // hospital token cannot subscribe to another hospital's room.
  if (user.role === "hospital" && user.hospitalId) {
    socket.join(hospitalRoom(user.hospitalId));
  }

  socket.on("driver:availability", async (payload: { available: boolean; lat?: number; lng?: number }) => {
    if (user.role !== "driver" || Date.now() - lastAvailability < 1000) return;
    lastAvailability = Date.now();
    try {
      const available = await verifyAccount(user);
      if (available && payload?.available) socket.join(drivers_room);
      else socket.leave(drivers_room);
    } catch (err) {
      socket.leave(drivers_room);
      console.error("[socket] availability validation failed", err);
    }
  });

  // User or driver subscribes to a booking-specific channel. Ownership is
  // verified server-side before joining the room — without this check, any
  // authenticated user could subscribe to ANY booking and watch live driver
  // location + status updates for a stranger's trip. (Security audit
  // finding #3, v1.0.11.4.)
  socket.on("booking:subscribe", async (payload: { bookingId: string }) => {
    if (!validId(payload?.bookingId)) return;
    try {
      const [b] = await db
        .select({ userId: bookings.userId, driverId: bookings.driverId })
        .from(bookings)
        .where(eq(bookings.id, payload.bookingId))
        .limit(1);
      if (!b) return;
      const isOwner = user.role === "user" && b.userId === user.sub;
      const isAssignedDriver = user.role === "driver" && b.driverId === user.sub;
      if (!isOwner && !isAssignedDriver) {
        console.warn(`[socket] ${user.role}:${user.sub} denied booking:subscribe on ${payload.bookingId}`);
        return;
      }
      if (socket.rooms.size >= 20) return;
      socket.join(bookingRoom(payload.bookingId));
    } catch (err) {
      console.warn("[socket] booking:subscribe lookup failed", err);
    }
  });

  socket.on("booking:unsubscribe", (payload: { bookingId: string }) => {
    if (!validId(payload?.bookingId)) return;
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
      ts?: number;
    }) => {
      if (user.role !== "driver") return;
      // Live relay to the user listening on the booking room — but only
      // if THIS driver is actually assigned to THIS booking. Without the
      // check, driver A could spoof location updates on driver B's
      // bookings. (Security audit finding #6, v1.0.11.4.)
      if (!validId(payload?.bookingId) || Date.now() - lastLocation < 1000) return;
      lastLocation = Date.now();
      if (![payload.lat, payload.lng, payload.ts].every(Number.isFinite) || Math.abs(payload.lat) > 90 || Math.abs(payload.lng) > 180 || !payload.ts || Date.now() - payload.ts > 120_000 || payload.ts > Date.now() + 10_000) return;
      try {
        const [b] = await db
          .select({ driverId: bookings.driverId })
          .from(bookings)
          .where(and(eq(bookings.id, payload.bookingId), eq(bookings.driverId, user.sub), inArray(bookings.status, ["ACCEPTED", "ARRIVED", "PICKED_UP"])))
          .limit(1);
        if (!b) {
          console.warn(`[socket] driver:${user.sub} denied driver:location on ${payload.bookingId} (not assigned)`);
          return;
        }
      } catch (err) {
        console.warn("[socket] driver:location ownership check failed", err);
        return;
      }
      io.to(bookingRoom(payload.bookingId)).emit("driver:location:update", {
        bookingId: payload.bookingId,
        lat: payload.lat,
        lng: payload.lng,
        speedKmh: payload.speedKmh,
        headingDeg: payload.headingDeg,
        ts: payload.ts
      });
    }
  );

  socket.on("disconnect", () => {
    clearTimeout(expiry); clearInterval(access);
    console.log(`[socket] ${user.role}:${user.sub} disconnected`);
  });
});

httpServer.listen(config.socketPort, "0.0.0.0", () => {
  console.log(`[socket-server] listening on :${config.socketPort}`);
});
