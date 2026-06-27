import { relations, sql } from "drizzle-orm";
import { pgTable, varchar, text, integer, boolean, index } from "drizzle-orm/pg-core";
import { yswsUsers } from "./ysws";
import { projects } from "./projects";
export const users = pgTable("users", {
  apiKey: varchar().unique(),
  userId: text().primaryKey().unique(),
  theseusKey: text(),
  hcbId: text(),
  pingGroup: text(),
  channel: text(),
  projects: integer().array(),
  disabled: boolean().default(false),
  optOuts: text().array(),
  meta: text().array(),
  region: text(),
  ysws: integer().array()
}, (table) => [
  index("users_active_idx")
    .on(table.userId)
    .where(sql`${table.disabled} = false`),
  index("users_hcb_active_idx")
    .on(table.hcbId)
    .where(sql`${table.disabled} = false AND ${table.hcbId} IS NOT NULL`)
]);

export const usersRelations = relations(users, ({ many }) => ({
  ysws: many(yswsUsers),
  projects: many(projects),
}));