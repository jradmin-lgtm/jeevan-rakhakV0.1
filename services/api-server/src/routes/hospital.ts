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
  // v1.2.1 (CR#3): `?scope=all` returns the full history — every ride to THIS
  // hospital regardless of status (active + COMPLETED + CANCELLED + TIMED_OUT),
  // newest first, capped 200, with created/completed/cancelled timestamps. The
  // default (`scope=active` / absent) keeps the live queue byte-for-byte intact.
  app.get("/api/v1/hospital/bookings", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const scope = String(req.query?.scope ?? "active").toLowerCase();
    if (scope === "all") {
      const rows = await pgClient`
        SELECT b.id, b.display_id, b.status, b.is_sos, b.emergency_type,
               b.patient_name, b.patient_age, b.patient_gender,
               b.pickup_lat, b.pickup_lng, b.pickup_address,
               b.drop_lat, b.drop_lng, b.accepted_at, b.arrived_at, b.picked_up_at,
               b.hospital_ack_at, b.created_at, b.completed_at, b.cancelled_at,
               (b.paramedic_assessment IS NOT NULL) AS has_assessment,
               d.name AS driver_name, d.id AS driver_id,
               d.vehicle_number AS ambulance_number, d.last_lat, d.last_lng
        FROM bookings b
        LEFT JOIN drivers d ON d.id = b.driver_id
        WHERE b.dest_hospital_id = ${hid}
        ORDER BY b.created_at DESC
        LIMIT 200
      `;
      const out = rows.map((r: any) => ({ ...r, paramedic_name: r.driver_name }));
      return reply.send({ bookings: out });
    }
    const rows = await pgClient`
      SELECT b.id, b.display_id, b.status, b.is_sos, b.emergency_type,
             b.patient_name, b.patient_age, b.patient_gender,
             b.pickup_lat, b.pickup_lng, b.pickup_address,
             b.drop_lat, b.drop_lng, b.accepted_at, b.arrived_at, b.picked_up_at,
             b.hospital_ack_at,
             (b.paramedic_assessment IS NOT NULL) AS has_assessment,
             d.name AS driver_name, d.id AS driver_id,
             d.vehicle_number AS ambulance_number, d.last_lat, d.last_lng
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

  // v1.2.1 (CR#3): READ-ONLY driver card, scoped to THIS hospital. RBAC gate —
  // the driver must be associated with hid (a driver_hospitals row) OR have at
  // least one booking destined here (dest_hospital_id=hid AND driver_id=did).
  // Otherwise 404 (never reveal a driver from another client). Stats + rides are
  // computed ONLY over rides to THIS hospital — never the driver's activity
  // elsewhere. NO phone/email/KYC docs are returned (admin-only fields).
  app.get("/api/v1/hospital/drivers/:id", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const did = req.params.id;
    // RBAC: tagged to this hospital, or has ≥1 ride destined here.
    const [{ ok = false } = {}] = await pgClient`
      SELECT (
        EXISTS (SELECT 1 FROM driver_hospitals WHERE driver_id = ${did} AND hospital_id = ${hid})
        OR EXISTS (SELECT 1 FROM bookings WHERE driver_id = ${did} AND dest_hospital_id = ${hid})
      ) AS ok`;
    if (!ok) return reply.code(404).send({ error: "not_found" }); // not associated → 404, never leak

    // Explicit-column select (defense-in-depth) — never pull phone/email/KYC
    // docs into memory for a hospital-scoped response.
    const [d] = await db
      .select({
        id: drivers.id,
        name: drivers.name,
        vehicleNumber: drivers.vehicleNumber,
        status: drivers.status,
        rating: drivers.rating,
        lastLat: drivers.lastLat,
        lastLng: drivers.lastLng,
        kycVerified: drivers.kycVerified
      })
      .from(drivers)
      .where(eq(drivers.id, did))
      .limit(1);
    if (!d) return reply.code(404).send({ error: "not_found" });

    // Rides = this driver's bookings destined to THIS hospital, all statuses,
    // newest first, capped 100. Stats are computed over the SAME scope only.
    const rides = await pgClient`
      SELECT b.id, b.display_id, b.status, b.is_sos, b.emergency_type,
             b.patient_name, b.patient_age, b.patient_gender,
             b.created_at, b.accepted_at, b.arrived_at, b.picked_up_at,
             b.completed_at, b.cancelled_at, b.hospital_ack_at
      FROM bookings b
      WHERE b.driver_id = ${did} AND b.dest_hospital_id = ${hid}
      ORDER BY b.created_at DESC
      LIMIT 100`;
    const [{ total = 0, completed = 0, active = 0, cancelled = 0 } = {}] = await pgClient`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
             COUNT(*) FILTER (WHERE status IN ('ACCEPTED','ARRIVED','PICKED_UP'))::int AS active,
             COUNT(*) FILTER (WHERE status IN ('CANCELLED','TIMED_OUT'))::int AS cancelled
      FROM bookings
      WHERE driver_id = ${did} AND dest_hospital_id = ${hid}`;

    // Precise GPS is scoped to *this* client: only expose lastLat/lastLng when
    // the driver currently has a LIVE ride to THIS hospital (active>0). Coarse
    // status (AVAILABLE/ON_TRIP/OFFLINE) is fine to show, but a driver's exact
    // location must never leak to a hospital they aren't currently serving —
    // e.g. while they're en route to a DIFFERENT hospital. (RBAC review v1.2.1.)
    const servingHere = active > 0;
    return reply.send({
      driver: {
        id: d.id,
        name: d.name,
        vehicleNumber: d.vehicleNumber,
        status: d.status,
        rating: d.rating,
        lastLat: servingHere ? d.lastLat : null,
        lastLng: servingHere ? d.lastLng : null,
        kycVerified: d.kycVerified
        // NO phone/email/KYC docs — admin-only fields, never surfaced to the portal.
      },
      stats: { total, completed, active, cancelled },
      rides
    });
  });

  // v1.2.1 (CR#3): raise a feedback/concern ticket from the portal. Validates the
  // subject belongs to THIS hospital (RIDE → bookingId destined here; DRIVER →
  // driverId associated here) so a hospital can't file a ticket about another
  // client's ride/driver. Inserts an OPEN support_tickets row scoped to hid.
  app.post("/api/v1/hospital/tickets", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const subjectType = String(req.body?.subjectType ?? "").trim().toUpperCase();
    const message = String(req.body?.message ?? "").trim();
    // v1.2.2: FEEDBACK (soft) vs ISSUE (actionable). Defaults to ISSUE so an
    // omitted/unknown category lands in the actionable Help & Support bucket.
    const category = String(req.body?.category ?? "ISSUE").trim().toUpperCase() === "FEEDBACK" ? "FEEDBACK" : "ISSUE";
    if (!["DRIVER", "RIDE", "GENERAL"].includes(subjectType)) return reply.code(400).send({ error: "invalid_subject" });
    if (message.length < 5) return reply.code(400).send({ error: "message_too_short" });

    let driverId: string | null = null;
    let bookingId: string | null = null;

    if (subjectType === "RIDE") {
      bookingId = req.body?.bookingId ? String(req.body.bookingId) : null;
      if (!bookingId) return reply.code(400).send({ error: "missing_booking" });
      const [b] = await db.select({ id: bookings.id }).from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.destHospitalId, hid))).limit(1);
      if (!b) return reply.code(400).send({ error: "invalid_booking" }); // not destined here
    } else if (subjectType === "DRIVER") {
      driverId = req.body?.driverId ? String(req.body.driverId) : null;
      if (!driverId) return reply.code(400).send({ error: "missing_driver" });
      const [{ ok = false } = {}] = await pgClient`
        SELECT (
          EXISTS (SELECT 1 FROM driver_hospitals WHERE driver_id = ${driverId} AND hospital_id = ${hid})
          OR EXISTS (SELECT 1 FROM bookings WHERE driver_id = ${driverId} AND dest_hospital_id = ${hid})
        ) AS ok`;
      if (!ok) return reply.code(400).send({ error: "invalid_driver" }); // not associated here
    }

    const [{ id } = {}] = await pgClient`
      INSERT INTO support_tickets (hospital_id, subject_type, category, driver_id, booking_id, message, status)
      VALUES (${hid}, ${subjectType}, ${category}, ${driverId}, ${bookingId}, ${message}, 'OPEN')
      RETURNING id`;
    return reply.send({ ok: true, id });
  });

  // v1.2.1 (CR#3): the caller hospital's own tickets, newest first, with the
  // linked driver/ride display info. Scoped to hospital_id=hid — never another
  // hospital's tickets.
  // v1.2.2: returns `category` and accepts an optional ?category=FEEDBACK|ISSUE
  // filter (additive — no filter / unknown value returns all, byte-identical to
  // the v1.2.1 default).
  app.get("/api/v1/hospital/tickets", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;
    const catRaw = String(req.query?.category ?? "").trim().toUpperCase();
    const category = catRaw === "FEEDBACK" || catRaw === "ISSUE" ? catRaw : null;
    const rows = await pgClient`
      SELECT t.id, t.subject_type, t.category, t.message, t.status, t.created_at, t.resolved_at,
             t.driver_id, t.booking_id,
             d.name AS driver_name, d.vehicle_number AS ambulance_number,
             b.display_id AS booking_display_id
      FROM support_tickets t
      LEFT JOIN drivers  d ON d.id = t.driver_id
      LEFT JOIN bookings b ON b.id = t.booking_id
      WHERE t.hospital_id = ${hid}
        ${category ? pgClient`AND t.category = ${category}` : pgClient``}
      ORDER BY t.created_at DESC`;
    return reply.send({ tickets: rows });
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

  // v1.2.2 (CR#3): scoped client-POV analytics board for the hospital portal.
  // RBAC: hid comes ONLY from the JWT claim and EVERY query is filtered to
  // dest_hospital_id = hid — a hospital can never see another client's rides.
  // No portal_* columns are touched here. "Today" is Asia/Kolkata, matching the
  // admin dashboard's IST convention (admin.ts uses
  // `... AT TIME ZONE 'Asia/Kolkata'` for all day-grouping); here we compare
  // `(<ts> AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date`.
  app.get("/api/v1/hospital/analytics", { preHandler: [(app as any).requireHospital] }, async (req: any, reply: any) => {
    const hid = req.user.hospitalId;

    // Headline live + today counts. is_sos/today use IST date math. preparingNow
    // = acknowledged (hospital_ack_at set) AND still en route (active statuses) —
    // i.e. the patient is incoming and the hospital has confirmed it's preparing.
    const [headline = {}] = await pgClient`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('ACCEPTED','ARRIVED','PICKED_UP'))::int AS incoming_now,
        COUNT(*) FILTER (
          WHERE hospital_ack_at IS NOT NULL
            AND status IN ('ACCEPTED','ARRIVED','PICKED_UP')
        )::int AS preparing_now,
        COUNT(*) FILTER (
          WHERE status = 'COMPLETED'
            AND (completed_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
        )::int AS arrivals_today,
        COUNT(*) FILTER (
          WHERE is_sos
            AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date
        )::int AS sos_today,
        COUNT(*)::int AS rides_total,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE status IN ('ACCEPTED','ARRIVED','PICKED_UP'))::int AS active,
        COUNT(*) FILTER (WHERE status IN ('CANCELLED','TIMED_OUT'))::int AS cancelled
      FROM bookings
      WHERE dest_hospital_id = ${hid}`;

    // Avg pickup → hospital (minutes) over COMPLETED rides in the last 30 days.
    // AVG over zero matching rows returns NULL in postgres → postgres.js maps it
    // to null, which is exactly the "null if none" contract.
    const [{ avg_pickup_to_hospital_min = null } = {}] = await pgClient`
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - picked_up_at)) / 60)::float AS avg_pickup_to_hospital_min
      FROM bookings
      WHERE dest_hospital_id = ${hid}
        AND status = 'COMPLETED'
        AND completed_at IS NOT NULL
        AND picked_up_at IS NOT NULL
        AND completed_at >= now() - interval '30 days'`;

    // Ambulances tagged to this hospital (mirrors /hospital/me counts).
    const [amb = {}] = await pgClient`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE d.status = 'AVAILABLE')::int AS online,
        COUNT(*) FILTER (WHERE d.status = 'ON_TRIP')::int AS on_trip
      FROM driver_hospitals dh JOIN drivers d ON d.id = dh.driver_id
      WHERE dh.hospital_id = ${hid}`;

    // Last-7-days rides/day (created_at, IST). Densified across the 7-day window
    // so every day appears even with zero rides.
    const last7 = await pgClient`
      WITH days AS (
        SELECT generate_series(
          (now() AT TIME ZONE 'Asia/Kolkata')::date - interval '6 days',
          (now() AT TIME ZONE 'Asia/Kolkata')::date,
          interval '1 day'
        )::date AS day
      ),
      per_day AS (
        SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS day, COUNT(*)::int AS count
        FROM bookings
        WHERE dest_hospital_id = ${hid}
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date
              >= (now() AT TIME ZONE 'Asia/Kolkata')::date - interval '6 days'
        GROUP BY 1
      )
      SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(p.count, 0)::int AS count
      FROM days d LEFT JOIN per_day p USING (day)
      ORDER BY d.day ASC`;

    // Case mix by emergency type over the last 30 days (created_at).
    const byType = await pgClient`
      SELECT emergency_type::text AS type, COUNT(*)::int AS count
      FROM bookings
      WHERE dest_hospital_id = ${hid}
        AND created_at >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 2 DESC`;

    return reply.send({
      incomingNow: (headline as any).incoming_now ?? 0,
      preparingNow: (headline as any).preparing_now ?? 0,
      arrivalsToday: (headline as any).arrivals_today ?? 0,
      sosToday: (headline as any).sos_today ?? 0,
      ridesTotal: (headline as any).rides_total ?? 0,
      avgPickupToHospitalMin: avg_pickup_to_hospital_min,
      ambulances: {
        total: (amb as any).total ?? 0,
        online: (amb as any).online ?? 0,
        onTrip: (amb as any).on_trip ?? 0
      },
      last7Days: last7.map((r: any) => ({ day: r.day, count: r.count })),
      byEmergencyType: byType.map((r: any) => ({ type: r.type, count: r.count })),
      statusMix: {
        completed: (headline as any).completed ?? 0,
        active: (headline as any).active ?? 0,
        cancelled: (headline as any).cancelled ?? 0
      }
    });
  });
}
