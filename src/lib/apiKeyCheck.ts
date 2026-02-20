import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import FT from "./ft";
import { logger } from "..";
type DB =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

export default async function checkAPIKey(db: DB, apiKey: string, logtape: typeof logger) {
  const row = await db
    .select()
    .from(users)
    .where(eq(users.apiKey, apiKey))
    .limit(1);

    if(row.length === 0) return false;
    if(row[0]?.disabled === true) return false;
    const client = new FT(apiKey, logger);
    await client.user({
        id: "me"
    });

    if(Number(client.lastCode) >= 200 && Number(client.lastCode) < 300) {
        return true
    } else return false
}
