import type { FastifyInstance } from "fastify";
import { sql } from "@jr/db";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ status: "ok", service: "api-server", build: process.env.RENDER_GIT_COMMIT ?? process.env.BUILD_SHA ?? "local" }));

  app.get("/health/db", async (_req, reply) => {
    try {
      await sql`select 1`;
      return { status: "ok", db: "up" };
    } catch (err) {
      app.log.error({ err }, "Database health check failed");
      reply.code(503);
      return { status: "error", db: "down", error: "database_unavailable" };
    }
  });
}
