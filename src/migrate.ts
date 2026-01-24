import { count } from "drizzle-orm";
import { PgliteDatabase } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { apiKeys } from "./migrationSchema/apiKeys";
import { users } from "./schema/users";
import { projectData } from "./migrationSchema/project";
import { projects } from "./schema/projects";
type DB =
    | (NodePgDatabase<Record<string, never>> & { $client: Pool })
    | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

async function migrateAPIKeysToUsers(db: DB) {
    const newInUse = await db
        .select({ count: count() })
        .from(users)
        .limit(1) as { count: number }[];

    let oldInUse: { count: number }[] = [{ count: 0 }];
    try {
        oldInUse = await db
            .select({ count: count() })
            .from(apiKeys)
            .limit(1) as { count: number }[];
    } catch {
        return;
    }

    if ((oldInUse[0]?.count ?? 0) === 0 || (newInUse[0]?.count ?? 0) > 0) return;
    console.log("[Logpheus] Migrating data in apiKeys table to use new users table")
    const migrate = (await db.select().from(apiKeys)).map(row => {
        const projects = Array.isArray(row.projects)
            ? row.projects
                .map((p: unknown) => Number(p))
                .filter(Number.isInteger)
            : [];

        return {
            apiKey: row.apiKey,
            userId: null,
            channel: row.channel,
            projects,
            disabled: row.disabled ?? false
        }
    })

    await db.insert(users).values(migrate);
    await db.execute(`DROP TABLE IF EXISTS api_keys;`);

}

async function migrateOldProjectTableToNew(db: DB) {
    const newInUse = await db
        .select({ count: count() })
        .from(projects)
        .limit(1) as { count: number }[];

    let oldInUse: { count: number }[] = [{ count: 0 }];
    try {
        oldInUse = await db
            .select({ count: count() })
            .from(projectData)
            .limit(1) as { count: number }[];
    } catch {
        return;
    }

    if ((oldInUse[0]?.count ?? 0) === 0 || (newInUse[0]?.count ?? 0) > 0) return;
    console.log("[Logpheus] Migrating data in project table to use new projects table")
    const migrate = (await db.select().from(projectData)).map(row => {
        const devlogIds = Array.isArray(row.ids)
            ? row.ids
                .map((p: unknown) => Number(p))
                .filter(Number.isInteger)
            : [];

        return {
            id: row.projectId,
            devlogIds,
            lastDevlog: null
        }
    })

    await db.insert(projects).values(migrate);
    await db.execute(`DROP TABLE IF EXISTS project;`);
}

export default async function runMigrations(db: DB) {
    await migrateAPIKeysToUsers(db);
    await migrateOldProjectTableToNew(db);
}