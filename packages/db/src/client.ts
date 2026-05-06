import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/jr_v0";

const queryClient = postgres(DATABASE_URL, {
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idle_timeout: 30,
  prepare: false
});

export const db = drizzle(queryClient, { schema });
export const sql = queryClient;
export { schema };
export type Db = typeof db;
