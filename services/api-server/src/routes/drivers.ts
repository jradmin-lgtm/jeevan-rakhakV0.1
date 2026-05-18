import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, sql as drizzleSql } from "drizzle-orm";
import { db, drivers, driverHeartbeats } from "@jr/db";

const availabilitySchema = z.object({
  status: z.enum(["OFFLINE", "AVAILABLE", "ON_TRIP"]),
  lat: z.number().optional(),
  lng: z.number().optional()
});

// KYC submission — driver fills these during onboarding (team feedback 1.10).
// All fields optional individually but the driver app validates completeness
// client-side before letting them tap submit. File uploads (driver photo,
// licence scan, RC scan, insurance scan) are deferred to v1.0.12 when blob
// storage lands — for v1.0.11 we collect the numbers only and admin verifies
// out-of-band against physical documents.
const kycSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  photoUrl: z.string().max(500).optional(),
  vehicleNumber: z.string().min(4).max(20).optional(),
  vehicleType: z.string().max(40).optional(),
  licenseNumber: z.string().min(4).max(40).optional(),
  rcNumber: z.string().min(4).max(40).optional(),
  insuranceNumber: z.string().min(4).max(60).optional(),
  hospitalId: z.string().max(60).optional(),
  hospitalName: z.string().max(200).optional()
});

export async function registerDriverRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/driver/availability",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const parsed = availabilitySchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      const { status, lat, lng } = parsed.data;
      const [d] = await db
        .update(drivers)
        .set({
          status,
          lastLat: lat,
          lastLng: lng,
          lastSeenAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(drivers.id, sub))
        .returning();
      return reply.send({ driver: d });
    }
  );

  // v1.0.15: "online" heartbeat. Driver app POSTs every 60s while toggled
  // online AND foregrounded. Upserts into driver_heartbeats so the SOS
  // cascade engine can pick the nearest available drivers without depending
  // on the trip-time location stream (which only fires during an active ride).
  // Returns 204 — body-less, intentional: this is a high-frequency poll, no
  // payload to negotiate.
  const heartbeatSchema = z.object({
    lat: z.number(),
    lng: z.number()
  });
  app.post(
    "/api/v1/driver/heartbeat",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const parsed = heartbeatSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      await db
        .insert(driverHeartbeats)
        .values({
          driverId: sub,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: driverHeartbeats.driverId,
          set: {
            lat: parsed.data.lat,
            lng: parsed.data.lng,
            updatedAt: new Date()
          }
        });
      // Also keep drivers.lastLat / lastLng / lastSeenAt fresh so admin's
      // existing "where is the driver" UI keeps working without a second
      // ping path. Doesn't change behavior of trip-time GPS pushes.
      await db
        .update(drivers)
        .set({
          lastLat: parsed.data.lat,
          lastLng: parsed.data.lng,
          lastSeenAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(drivers.id, sub));
      return reply.code(204).send();
    }
  );

  app.post(
    "/api/v1/driver/kyc",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role !== "driver") return reply.code(403).send({ error: "driver_only" });
      const parsed = kycSchema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      // Driver submits — flag never auto-verifies. Admin must flip
      // kycVerified true via PATCH /admin/drivers/:id (new route in admin.ts).
      const [d] = await db
        .update(drivers)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(drivers.id, sub))
        .returning();
      return reply.send({ driver: d });
    }
  );
}
