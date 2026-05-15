import {
  pgTable,
  text,
  jsonb,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const agentMemoryTable = pgTable(
  "agent_memory",
  {
    namespace: text("namespace").notNull(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.namespace, t.key] }),
    expiresAtIdx: index("agent_memory_expires_at_idx").on(t.expiresAt),
  }),
);

export type AgentMemoryRow = typeof agentMemoryTable.$inferSelect;
