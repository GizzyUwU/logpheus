import { pgTable, text, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
export const theseus = pgTable(
  "theseus",
  {
    userId: text().notNull().references(() => users.userId, {
      onDelete: "cascade",
      onUpdate: "cascade"
    }),
    id: text().notNull(),
    title: text().notNull(),
    public_url: text().notNull(),
    type: text().notNull(),
    status: text().notNull(),
    created_at: timestamp().notNull(),
    updated_at: timestamp().notNull(),
    dispatched_at: timestamp(),
    mailed_at: timestamp(),
    carrier: text(),
    service: text(),
    tracking_number: text(),
    tracking_link: text(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);
