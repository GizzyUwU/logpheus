import { pgTable, text } from "drizzle-orm/pg-core";
export const hcb = pgTable("hcb", {
  user_id: text().notNull().primaryKey(),
  ids: text().array().notNull(),
});