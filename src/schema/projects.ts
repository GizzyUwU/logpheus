import { pgTable, integer, real, primaryKey, text } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
export const projects = pgTable("projects", {
  id: integer().notNull(),
  userId: text().references(() => users.userId, {
    onDelete: "cascade",
    onUpdate: "cascade"
  }),
  devlogIds: integer().array().notNull(),
  predictedCookies: integer().default(0),
  predictedCurrency: integer().default(0),
  multiplier: real().default(0),
  ysws: integer().default(0)
}, (table) => [
  primaryKey({ columns: [table.id, table.ysws] }),
]);

export const projectsRelations = relations(projects, ({ one }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.userId]
  })
}))