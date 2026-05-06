import type { FastifyInstance } from "fastify";
import { sql } from "@jr/db";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "api-server" }));

  app.get("/health/db", async (_req, reply) => {
    try {
      await sql`select 1`;
      return { status: "ok", db: "up" };
    } catch (err) {
      reply.code(503);
      return { status: "error", db: "down", error: String(err) };
    }
  });
}
