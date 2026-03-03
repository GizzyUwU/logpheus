import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import FT from "./ft";
import type { logger as LogTape } from "..";
type DB =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

export default async function checkAPIKey(data: {
  db: DB;
  apiKey: string;
  logger: typeof LogTape;
  allowTheDisabled?: boolean;
  userId?: string;
  register?: boolean;
}) {
  if (!data.allowTheDisabled || !data.userId) {
    const row = await data.db
      .select()
      .from(users)
      .where(eq(users.apiKey, data.apiKey))
      .limit(1);
    if (row.length === 0) {
      if(data.register === true) return true;
      return false;
    }
    if (row[0]?.disabled === true) return false;
    const client = new FT(data.apiKey, data.logger);
    const res = await client.user({
      id: "me",
    });
    if (Number(res.status) >= 200 && Number(res.status) < 300) {
      return true;
    } else return false;
  } else {
    const row = await data.db
      .select()
      .from(users)
      .where(eq(users.userId, data.userId))
      .limit(1);
    if (row.length === 0) return false;
    const client = new FT(data.apiKey, data.logger);
    const res = await client.user({
      id: "me",
    });
    if (Number(res.status) >= 200 && Number(res.status) < 300) {
      return true;
    } else return false;
  }
}
