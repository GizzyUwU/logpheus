import { pgTable, integer } from "drizzle-orm/pg-core";
export const projects = pgTable("projects", {
  id: integer().notNull().primaryKey(),
  devlogIds: integer().array().notNull(),
  predictedCookies: integer().default(0),
  multiplier: integer().default(0)
});