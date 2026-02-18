import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";
export const projects = pgTable("projects", {
  id: integer().notNull().primaryKey(),
  devlogIds: integer().array().notNull(),
  lastDevlog: timestamp("devlog_created_at", { mode: "string" })
});