import { and, eq, gt, sql } from "drizzle-orm";
import {
  agentMemoryTable,
  getDb,
  isDatabaseConfigured,
} from "@workspace/db";

export class AgentMemoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgentMemoryError";
  }
}

const NAMESPACE_MIN = 1;
const NAMESPACE_MAX = 128;
const KEY_MIN = 1;
const KEY_MAX = 256;
const MAX_VALUE_BYTES = 4 * 1024;
const DEFAULT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const MAX_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const MIN_TTL_SECONDS = 60; // 1 minute

export type SetMemoryInput = {
  namespace: string;
  key: string;
  value: unknown;
  ttlSeconds?: number;
};

export type SetMemoryResult = {
  namespace: string;
  key: string;
  bytes: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  fetchedAt: string;
};

export type GetMemoryInput = {
  namespace: string;
  key: string;
};

export type GetMemoryResult = {
  namespace: string;
  key: string;
  value: unknown;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  fetchedAt: string;
};

export function isAgentMemoryEnabled(): boolean {
  return isDatabaseConfigured();
}

function validateNamespaceKey(namespace: unknown, key: unknown): {
  ns: string;
  k: string;
} {
  if (typeof namespace !== "string") {
    throw new AgentMemoryError("'namespace' must be a string", 400);
  }
  if (typeof key !== "string") {
    throw new AgentMemoryError("'key' must be a string", 400);
  }
  if (namespace.length < NAMESPACE_MIN || namespace.length > NAMESPACE_MAX) {
    throw new AgentMemoryError(
      `'namespace' length must be ${NAMESPACE_MIN}-${NAMESPACE_MAX}`,
      400,
    );
  }
  if (key.length < KEY_MIN || key.length > KEY_MAX) {
    throw new AgentMemoryError(
      `'key' length must be ${KEY_MIN}-${KEY_MAX}`,
      400,
    );
  }
  return { ns: namespace, k: key };
}

export async function setMemory(
  input: SetMemoryInput,
): Promise<SetMemoryResult> {
  const { ns, k } = validateNamespaceKey(input.namespace, input.key);
  if (input.value === undefined) {
    throw new AgentMemoryError("'value' is required", 400);
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(input.value);
  } catch {
    throw new AgentMemoryError("'value' must be JSON-serializable", 400);
  }
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > MAX_VALUE_BYTES) {
    throw new AgentMemoryError(
      `'value' too large: ${bytes} bytes (max ${MAX_VALUE_BYTES})`,
      413,
    );
  }
  let ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  if (typeof ttl !== "number" || !Number.isFinite(ttl)) {
    throw new AgentMemoryError("'ttlSeconds' must be a number", 400);
  }
  ttl = Math.floor(ttl);
  if (ttl < MIN_TTL_SECONDS || ttl > MAX_TTL_SECONDS) {
    throw new AgentMemoryError(
      `'ttlSeconds' must be ${MIN_TTL_SECONDS}-${MAX_TTL_SECONDS}`,
      400,
    );
  }
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const db = getDb();
  let rows;
  try {
    rows = await db
      .insert(agentMemoryTable)
      .values({
        namespace: ns,
        key: k,
        value: input.value as object,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [agentMemoryTable.namespace, agentMemoryTable.key],
        set: {
          value: input.value as object,
          expiresAt,
          updatedAt: sql`now()`,
        },
      })
      .returning();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "db error";
    throw new AgentMemoryError(`Storage error: ${msg}`, 502);
  }
  const row = rows[0];
  if (!row) throw new AgentMemoryError("Storage returned no row", 502);
  return {
    namespace: row.namespace,
    key: row.key,
    bytes,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}

export async function getMemory(
  input: GetMemoryInput,
): Promise<GetMemoryResult> {
  const { ns, k } = validateNamespaceKey(input.namespace, input.key);
  const db = getDb();
  let rows;
  try {
    rows = await db
      .select()
      .from(agentMemoryTable)
      .where(
        and(
          eq(agentMemoryTable.namespace, ns),
          eq(agentMemoryTable.key, k),
          gt(agentMemoryTable.expiresAt, new Date()),
        ),
      )
      .limit(1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "db error";
    throw new AgentMemoryError(`Storage error: ${msg}`, 502);
  }
  const row = rows[0];
  if (!row) {
    throw new AgentMemoryError(
      `No value found for ${ns}/${k} (or expired)`,
      404,
    );
  }
  return {
    namespace: row.namespace,
    key: row.key,
    value: row.value,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}
