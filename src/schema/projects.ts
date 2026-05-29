import { pgTable, integer, real } from "drizzle-orm/pg-core";
export const projects = pgTable("projects", {
  id: integer().notNull().primaryKey(),
  devlogIds: integer().array().notNull(),
  predictedCookies: integer().default(0),
  predictedCurrency: integer().default(0),
  multiplier: real().default(0),
  ysws: integer().default(0)
});