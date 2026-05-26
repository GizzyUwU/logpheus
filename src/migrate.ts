import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { logger as LogtapeLogger } from "@/index.ts";
import { users } from "@/schema/users.ts";
import { yswsUsers } from "@/schema/ysws.ts";
import { eq, isNotNull, ne, and } from "drizzle-orm";
import ysws from "@/ysws.ts"

type DB =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

export default async function (db: DB, logger: typeof LogtapeLogger) {
  const allUsers = await db
    .select()
    .from(users)
    .where(and(isNotNull(users.apiKey), ne(users.apiKey, "")));

  if (allUsers.length === 0) return;

  logger.info("Migrating users to new table schema!", )

  const rows = allUsers.map((user) => ({
    yswsId: ysws.flavortown.id,
    apiKey: user.apiKey,
    userId: user.userId,
    projects: user.projects,
    disabled: user.disabled,
    optOuts: user.optOuts,
  }));

  await db
    .insert(yswsUsers)
    .values(rows)
    .onConflictDoNothing();

  logger.info(`Inserted ${rows.length} rows into ysws table, updating users...`);

  const usersToUpdate = allUsers.filter(
    (user) => !user.ysws?.includes(ysws.flavortown.id)
  );

  for (const user of usersToUpdate) {
    await db
      .update(users)
      .set({
        ysws: [...(user.ysws ?? []), ysws.flavortown.id],
        projects: [],
        apiKey: null
      })
      .where(eq(users.apiKey, user.apiKey!));
  }

  logger.info(`${usersToUpdate.length} users migrated! Added to flavortown ysws table with projects and their apiKey dropping projects and apiKey from users table`);
}