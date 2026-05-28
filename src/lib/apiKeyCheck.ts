import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { eq, type InferSelectModel } from "drizzle-orm";
import type { logger as LogTape } from "@/index";
import { users } from "@/schema/users";
type DB =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

export default async function checkAPIKey(data: {
  db?: DB;
  userData?: InferSelectModel<typeof users>;
  apiKey: string | undefined;
  logger: typeof LogTape;
  allowTheDisabled?: boolean;
  userId?: string;
}): Promise<
  { works: false } | { works: true; row: InferSelectModel<typeof users> }
> {
  if (!data.apiKey || (!data.userData && !data.db)) return { works: false };
  if (!data.apiKey.startsWith("logpheus_sk_")) return { works: false };
  if (!data.userData && data.db) {
    const row = await data.db
      .select()
      .from(users)
      .where(eq(users.apiKey, data.apiKey))
      .limit(1);

    const user = row[0];

    if (!user) return { works: false };

    if (!data.allowTheDisabled && user.disabled === true) {
      return { works: false };
    }

    return { works: true, row: user };
  } else if (data.userData) {
    if (Object.keys(data.userData).length === 0) return { works: false };
    if (!data.allowTheDisabled && data.userData?.disabled === true)
      return { works: false };
    return { works: true, row: data.userData };
  } else return { works: false };
}
