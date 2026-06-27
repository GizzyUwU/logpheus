import { pgTable, text, integer, boolean, real, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { relations } from "drizzle-orm";
export const yswsUsers = pgTable("ysws", {
  yswsId: integer().notNull(),
  apiKey: text(),
  userId: text().notNull().references(() => users.userId, {
    onDelete: "cascade",
    onUpdate: "cascade"
  }),
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

export const yswsRelations = relations(yswsUsers, ({ one }) => ({
  user: one(users, {
    fields: [yswsUsers.userId],
    references: [users.userId]
  })
}))