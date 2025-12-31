import { pgTable, varchar, text } from "drizzle-orm/pg-core";
export const metadata = pgTable("meta", {
  key: varchar().notNull().primaryKey(),
  value: text().notNull(),
});