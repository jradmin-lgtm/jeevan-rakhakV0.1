import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { db, hospitals, bookings, drivers, sql as pgClient } from "@jr/db";
import { config } from "@jr/config";
import { verifyPassword } from "../password";
import { resolveParamedic } from "../paramedic";

const RATE_LIMIT_BYPASS = process.env.RATE_LIMIT_BYPASS === "1";

export async function registerHospitalRoutes(app: FastifyInstance) {
  // CR#3: hospital portal login. Signs with the existing app.jwt secret + a
  // role:"hospital" + hospitalId claim so the socket-server validates it for
  // free (no new secret). RBAC downstream derives hospitalId ONLY from this
  // claim — never from query/body.
  // v1.2.0 hardening: per-route IP rate limit (mirrors auth.ts verify-OTP) so a
  // hospital username — which is admin-set and often guessable (e.g. "srms") —
  // can't be password-brute-forced. scrypt + 8-char min are the other layers.
  app.post("/api/v1/hospital/login", {
    config: RATE_LIMIT_BYPASS
      ? {}
      : { rateLimit: { max: config.rateLimitVerifyPerMin, timeWindow: "1 minute" } }
  }, async (req: any, reply: any) => {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!username || !password) return reply.code(400).send({ error: "missing_credentials" });
    const [h] = await db.select().from(hospitals).where(eq(hospitals.portalUsername, username)).limit(1);
    if (!h || !h.portalEnabled || !h.portalPasswordHash) return reply.code(401).send({ error: "invalid_login" });
    const ok = verifyPassword(password, h.portalPasswordHash);
    if (!ok) return reply.code(401).send({ error: "invalid_login" });
    const token = app.jwt.sign({ sub: h.id, role: "hospital", hospitalId: h.id, phone: "" }, { expiresIn: "8h" });
    return reply.send({ token, hospital: { id: h.id, name: h.name } });
  });

  // CR#3: hospital profile + live ambulance counts. Scoped to the token claim.
  app.get("/api/v1/hospital/me", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const [h] = await db.select().from(hospitals).where(eq(hospitals.id, hid)).limit(1);
    if (!h) return reply.code(404).send({ error: "not_found" });
    const [{ total = 0 } = {}] = await pgClient`SELECT COUNT(*)::int AS total FROM driver_hospitals WHERE hospital_id = ${hid}`;
    const [{ online = 0 } = {}] = await pgClient`
      SELECT COUNT(*)::int AS online FROM driver_hospitals dh JOIN drivers d ON d.id = dh.driver_id
      WHERE dh.hospital_id = ${hid} AND d.status = 'AVAILABLE'`;
    const [{ on_trip = 0 } = {}] = await pgClient`
      SELECT COUNT(*)::int AS on_trip FROM driver_hospitals dh JOIN drivers d ON d.id = dh.driver_id
      WHERE dh.hospital_id = ${hid} AND d.status = 'ON_TRIP'`;
    return reply.send({
      hospital: { id: h.id, name: h.name, address: h.address, city: h.city },
      counts: { total, online, onTrip: on_trip }
    });
  });

  // CR#3: live incoming queue — active rides destined to THIS hospital only.
  app.get("/api/v1/hospital/bookings", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const rows = await pgClient`
      SELECT b.id, b.display_id, b.status, b.is_sos, b.emergency_type,
             b.patient_name, b.patient_age, b.patient_gender,
             b.pickup_lat, b.pickup_lng, b.pickup_address,
             b.drop_lat, b.drop_lng, b.accepted_at, b.arrived_at, b.picked_up_at,
             b.hospital_ack_at,
             (b.paramedic_assessment IS NOT NULL) AS has_assessment,
             d.name AS driver_name, d.vehicle_number AS ambulance_number, d.last_lat, d.last_lng
      FROM bookings b
      LEFT JOIN drivers d ON d.id = b.driver_id
      WHERE b.dest_hospital_id = ${hid}
        AND b.status IN ('ACCEPTED','ARRIVED','PICKED_UP')
      ORDER BY b.is_sos DESC, b.created_at DESC
    `;
    // paramedic = driver for pilot (resolver); add it without exposing driver internals.
    const out = rows.map((r: any) => ({ ...r, paramedic_name: r.driver_name }));
    return reply.send({ bookings: out });
  });

  // CR#3: unified A/B/C record. 404 if not destined here — cross-hospital RBAC.
  app.get("/api/v1/hospital/bookings/:id", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const [b] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.destHospitalId, hid))).limit(1);
    if (!b) return reply.code(404).send({ error: "not_found" }); // cross-hospital → 404, never leak
    let driver: any = null;
    if (b.driverId) [driver] = await db.select().from(drivers).where(eq(drivers.id, b.driverId)).limit(1);
    return reply.send({
      sectionA: { name: b.patientName, age: b.patientAge, gender: b.patientGender,
                  emergencyType: b.emergencyType, condition: b.patientCondition, notes: b.patientNotes },
      sectionB: b.paramedicAssessment ?? null,
      sectionC: { status: b.status, ambulanceLat: driver?.lastLat ?? null, ambulanceLng: driver?.lastLng ?? null,
                  dropLat: b.dropLat, dropLng: b.dropLng, ackAt: b.hospitalAckAt },
      paramedicName: resolveParamedic(driver),
      ambulanceNumber: driver?.vehicleNumber ?? null,
      driverName: driver?.name ?? null,
      displayId: b.displayId, isSos: b.isSos
    });
  });

  // CR#3: drivers tagged to THIS hospital + live status. Scoped.
  app.get("/api/v1/hospital/drivers", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const rows = await pgClient`
      SELECT d.id, d.name, d.vehicle_number, d.status, dh.is_primary
      FROM driver_hospitals dh JOIN drivers d ON d.id = dh.driver_id
      WHERE dh.hospital_id = ${hid} ORDER BY d.status, d.name`;
    return reply.send({ drivers: rows });
  });

  // CR#3: "acknowledge — preparing" loop-closer. Scope-checked (404 cross-hospital).
  app.post("/api/v1/hospital/bookings/:id/acknowledge", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const note = req.body?.note ? String(req.body.note) : null;
    const [b] = await db.select().from(bookings)
      .where(and(eq(bookings.id, req.params.id), eq(bookings.destHospitalId, hid))).limit(1);
    if (!b) return reply.code(404).send({ error: "not_found" });
    await db.update(bookings).set({ hospitalAckAt: new Date(), hospitalAckNote: note }).where(eq(bookings.id, b.id));
    // Notify admin + assigned driver that the hospital is preparing.
    if (b.driverId) {
      await fetch(`${config.socketBaseUrl}/internal/emit-to-driver`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
        body: JSON.stringify({ driverId: b.driverId, event: "hospital:preparing", payload: { bookingId: b.id } })
      }).catch(() => {});
    }
    await fetch(`${config.socketBaseUrl}/internal/booking-event`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-internal": config.internalApiSecret },
      body: JSON.stringify({ bookingId: b.id, type: "hospital_ack", hospitalAckAt: new Date().toISOString() })
    }).catch(() => {});
    return reply.send({ ok: true });
  });
}
