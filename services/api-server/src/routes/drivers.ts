import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, drivers } from "@jr/db";

const availabilitySchema = z.object({
  status: z.enum(["OFFLINE", "AVAILABLE", "ON_TRIP"]),
  lat: z.number().optional(),
  lng: z.number().optional()
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
}
