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
  if (!data.apiKey) return { works: false };

  const allowDisabledByUser =
    data.allowTheDisabled === true &&
    typeof data.userId === "string" &&
    data.userId.length > 0;

  const row = allowDisabledByUser
    ? await data.db
        .select()
        .from(users)
        .where(eq(users.userId, data.userId!))
        .limit(1)
    : await data.db
        .select()
        .from(users)
        .where(eq(users.apiKey, data.apiKey))
        .limit(1);

  if (row.length === 0) {
    return { works: data.register === true && !allowDisabledByUser };
  }

  if (!allowDisabledByUser && row[0]?.disabled === true) {
    return { works: false };
  }

  const client = new FT(data.apiKey, data.logger);
  const res = await client.user({
    id: "me",
  });

  return { works: typeof res.status === "number" && res.status >= 200 && res.status < 300, row };
}
