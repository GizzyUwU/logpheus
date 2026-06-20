import { pgTable, text, integer, numeric, primaryKey } from "drizzle-orm/pg-core";
export const shopTrack = pgTable(
  "shop",
  {
    yswsId: integer().notNull(),
    id: integer().notNull(),
    name: text().notNull(),
    description: text(),
    baseHours: numeric({ precision: 30, scale: 10 }).notNull(),
    baseCost: numeric({ precision: 30, scale: 10 }).notNull(),
    imageUrl: text(),
    regionalCosts: text(),
    previousRaw: text(),
    stock: integer()
  },
  (table) => [primaryKey({ columns: [table.yswsId, table.id] })],
);
