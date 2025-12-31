import { pgTable, varchar, text, json } from "drizzle-orm/pg-core";
export const apiKeys = pgTable("api_keys", {
  apiKey: varchar().notNull().primaryKey(),
  channel: text().notNull().unique(),
  projects: json().array().notNull()
});