import { pgTable, integer, json, text } from "drizzle-orm/pg-core";
export const projectData = pgTable("project", {
  projectId: integer().notNull().primaryKey(),
  ids: json().array().notNull().default([]),
  shipStatus: text()
});