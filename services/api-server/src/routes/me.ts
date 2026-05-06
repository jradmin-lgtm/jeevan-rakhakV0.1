import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, drivers, users } from "@jr/db";

const profileUpdate = z.object({
  name: z.string().min(1).max(120).optional(),
  bloodGroup: z.string().max(8).optional(),
  allergies: z.string().max(2000).optional(),
  emergencyContact: z.string().max(40).optional()
});

export async function registerMeRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/me",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      if (role === "user") {
        const [u] = await db.select().from(users).where(eq(users.id, sub)).limit(1);
        if (!u) return reply.code(404).send({ error: "not_found" });
        return reply.send({ role, profile: u });
      }
      if (role === "driver") {
        const [d] = await db.select().from(drivers).where(eq(drivers.id, sub)).limit(1);
        if (!d) return reply.code(404).send({ error: "not_found" });
        return reply.send({ role, profile: d });
      }
      return reply.code(403).send({ error: "forbidden" });
    }
  );

  app.patch(
    "/api/v1/me",
    { preHandler: [(app as any).authenticate] },
    async (req: any, reply) => {
      const { sub, role } = req.user;
      const parsed = profileUpdate.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_input", details: parsed.error.flatten() });
      }
      const data = parsed.data;
      if (role === "user") {
        const [u] = await db
          .update(users)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(users.id, sub))
          .returning();
        return reply.send({ role, profile: u });
      }
      if (role === "driver") {
        const [d] = await db
          .update(drivers)
          .set({ name: data.name, updatedAt: new Date() })
          .where(eq(drivers.id, sub))
          .returning();
        return reply.send({ role, profile: d });
      }
      return reply.code(403).send({ error: "forbidden" });
    }
  );
}
