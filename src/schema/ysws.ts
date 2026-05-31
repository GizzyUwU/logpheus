import { pgTable, text, integer, boolean, real, primaryKey } from "drizzle-orm/pg-core";
export const yswsUsers = pgTable("ysws", {
  yswsId: integer().notNull(),
  apiKey: text(),
  userId: text().notNull(),
  accId: text(),
  projects: integer().array(),
  disabled: boolean().default(false),
  optOuts: text().array(),
  region: text(),
  goals: integer().array(),
  avgMult: real().default(0),
  meta: text().array(),
}, (table) => [
  primaryKey({ columns: [table.yswsId, table.userId] }),
]);