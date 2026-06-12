import { pgTable, text, integer, real, primaryKey } from "drizzle-orm/pg-core";
export const shopTrack = pgTable(
  "shop",
  {
    yswsId: integer().notNull(),
    id: integer().notNull(),
    name: text().notNull(),
    description: text(),
    baseHours: real(),
    baseCost: integer().notNull(),
    imageUrl: text(),
    regionalCosts: text(),
    previousRaw: text(),
  },
  (table) => [primaryKey({ columns: [table.yswsId, table.id] })],
);
