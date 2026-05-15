import type { RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@workspace/db";
import { TOOLS } from "./x402-config";
import { logger } from "./logger";

const ROW_ID = "global";

const PRICE_ATOMIC_BY_PATH: Map<string, bigint> = new Map(
  TOOLS.map((tool) => {
    const usd = Number(tool.price.replace(/[^0-9.]/g, ""));
    const atomic = BigInt(Math.round(usd * 1_000_000));
    return [tool.path, atomic];
  }),
);

// In-memory fallback for when DATABASE_URL is not configured.
const memoryStartedAt = new Date();
let memoryCalls = 0n;
let memoryAtomic = 0n;

let bootstrapped = false;
let bootstrapPromise: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  if (bootstrapped) return;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS stats_counter (
        id text PRIMARY KEY,
        calls bigint NOT NULL DEFAULT 0,
        revenue_atomic bigint NOT NULL DEFAULT 0,
        since timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      INSERT INTO stats_counter (id) VALUES (${ROW_ID})
      ON CONFLICT (id) DO NOTHING
    `);
    bootstrapped = true;
  })();
  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}

export async function recordPaidCall(reqPath: string): Promise<void> {
  const price = PRICE_ATOMIC_BY_PATH.get(reqPath);
  if (price === undefined) return;
  if (!isDatabaseConfigured()) {
    memoryCalls += 1n;
    memoryAtomic += price;
    return;
  }
  try {
    await bootstrap();
    const db = getDb();
    await db.execute(sql`
      UPDATE stats_counter
      SET calls = calls + 1,
          revenue_atomic = revenue_atomic + ${price.toString()}::bigint
      WHERE id = ${ROW_ID}
    `);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), path: reqPath },
      "stats: failed to record paid call",
    );
  }
}

export async function getStats(): Promise<{
  calls: number;
  revenueUsd: number;
  since: string;
}> {
  if (!isDatabaseConfigured()) {
    return {
      calls: Number(memoryCalls),
      revenueUsd: Number(memoryAtomic) / 1_000_000,
      since: memoryStartedAt.toISOString(),
    };
  }
  try {
    await bootstrap();
    const db = getDb();
    const result = await db.execute<{
      calls: string;
      revenue_atomic: string;
      since: Date | string;
    }>(sql`
      SELECT calls, revenue_atomic, since
      FROM stats_counter
      WHERE id = ${ROW_ID}
    `);
    const row = result.rows[0];
    if (!row) {
      return { calls: 0, revenueUsd: 0, since: new Date().toISOString() };
    }
    const since =
      row.since instanceof Date ? row.since.toISOString() : String(row.since);
    return {
      calls: Number(row.calls),
      revenueUsd: Number(BigInt(row.revenue_atomic)) / 1_000_000,
      since,
    };
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "stats: failed to read counter",
    );
    return { calls: 0, revenueUsd: 0, since: new Date().toISOString() };
  }
}

export const settlementCounterMiddleware: RequestHandler = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const settled = res.getHeader("X-PAYMENT-RESPONSE");
    if (!settled) return;
    void recordPaidCall(req.path);
  });
  next();
};
