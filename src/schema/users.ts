import { pgTable, varchar, text, integer, boolean } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  apiKey: varchar().unique(),
  userId: text().primaryKey().unique(),
  channel: text().unique(),
  projects: integer().array(),
  disabled: boolean().default(false),
  optOuts: text().array(),
  meta: text().array(),
  region: text(),
  ysws: integer().array()
});