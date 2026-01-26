import { pgTable, varchar, text, integer, boolean } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  apiKey: varchar().notNull().primaryKey(),
  userId: text(),
  channel: text().unique(),
  projects: integer().array(),
  disabled: boolean().default(false),
  optOuts: text().array()
});