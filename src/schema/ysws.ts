import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";
export const yswsUsers = pgTable("ysws", {
  yswsId: integer().notNull().primaryKey(),
  apiKey: text(),
  userId: text(),
  projects: integer().array(),
  disabled: boolean().default(false),
  optOuts: text().array(),
  region: text(),
  goals: integer().array(),
  meta: text().array(),
});