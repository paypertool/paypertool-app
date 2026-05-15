import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let cachedPool: pg.Pool | null = null;
let cachedDb: NodePgDatabase<typeof schema> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env["DATABASE_URL"]);
}

export function getPool(): pg.Pool {
  if (cachedPool) return cachedPool;
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }
  cachedPool = new Pool({ connectionString: url });
  return cachedPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (cachedDb) return cachedDb;
  cachedDb = drizzle(getPool(), { schema });
  return cachedDb;
}

export * from "./schema";
