import { pgTable, varchar, text, integer, boolean } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  apiKey: varchar().notNull().primaryKey(),
  userId: text(),
  channel: text().notNull().unique(),
  projects: integer().array().notNull(),
  disabled: boolean()
});