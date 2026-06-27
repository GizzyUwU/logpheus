import { pgTable, text } from "drizzle-orm/pg-core";
export const hcb = pgTable("hcb", {
  userId: text().notNull().primaryKey(),
  ids: text().array().notNull(),
});