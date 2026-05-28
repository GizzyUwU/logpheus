import { pgTable, text, integer, boolean, real } from "drizzle-orm/pg-core";
export const yswsUsers = pgTable("ysws", {
  yswsId: integer().notNull().primaryKey(),
  apiKey: text(),
  userId: text(),
  projects: integer().array(),
  disabled: boolean().default(false),
  optOuts: text().array(),
  region: text(),
  goals: integer().array(),
  avgMult: real().default(0),
  meta: text().array(),
});