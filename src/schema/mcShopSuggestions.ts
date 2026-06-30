import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
export const mcShopSuggestions = pgTable(
  "mcShopSuggestions",
  {
    id: integer().notNull().primaryKey(),
    name: text().notNull(),
    description: text(),
    storeUrl: text(),
    imageUrl: text(),
    groupTag: text(),
    upvoteCount: integer(),
    showUsername: boolean().notNull(),
    createdAt: timestamp({
      withTimezone: true,
      mode: "string"
    }).notNull(),
    submitter: text(),
  },
);
