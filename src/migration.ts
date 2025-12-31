import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { apiKeys } from "./schema/apiKeys";
import { metadata } from "./schema/meta";
import { projectData } from "./schema/project";
import path from "node:path";
import fs from "node:fs";
const cacheDir = path.join(__dirname, "../cache");
const apiKeysFile = path.join(__dirname, "../cache/apiKeys.json");
const db = new Database(path.join(__dirname, "../cache/logpheus.db"), { create: true });
const pg = drizzle(path.join(cacheDir, "pg"), {
    casing: 'snake_case'
})

async function hasMigratedPg(key: string): Promise<boolean> {
    const row = await pg
        .select({ value: metadata.value })
        .from(metadata)
        .where(eq(metadata.key, key))
        .limit(1);

    return row[0]?.value === "true";
}

async function markMigratedPg(key: string) {
    await pg
        .insert(metadata)
        .values({ key, value: "true" })
        .onConflictDoUpdate({
            target: metadata.key,
            set: { value: "true" },
        });
}

async function migrateFromJson() {
    if (!await hasMigratedPg("project_cache")) {
        if (!fs.existsSync(cacheDir)) return;

        for (const file of fs.readdirSync(cacheDir)) {
            if (!file.endsWith(".json")) continue;
            if (file === "apiKeys.json") continue;
            const projectId = Number(file.replace(".json", ""));
            if (!Number.isFinite(projectId)) continue;
            const exists = await pg.select().from(projectData).where(eq(projectData.projectId, projectId)).limit(1);
            if (exists.length) continue;
            try {
                const data = JSON.parse(fs.readFileSync(path.join(cacheDir, file), "utf-8"));
                if (!Array.isArray(data.ids)) continue;
                const sortedIds = data.ids
                    .map((id: string) => Number(id))
                    .filter((id: number) => Number.isFinite(id))
                    .sort((a: number, b: number) => a - b)
                    .map(String);

                await pg
                    .insert(projectData)
                    .values({
                        projectId: projectId,
                        ids: sortedIds,
                        shipStatus: data.ship_status || null,
                    })
                    .onConflictDoUpdate({
                        target: projectData.projectId,
                        set: {
                            ids: sortedIds,
                            shipStatus: data.ship_status || null,
                        },
                    });
                console.log(`[Migration] ${projectId} project got migrated to the pg db from the json db`);
            } catch (err) {
                console.error(`[Migration] Failed project ${projectId}`, err);
            }
        }
    }

    if (!await hasMigratedPg("api_keys")) {
        const data = JSON.parse(fs.readFileSync(apiKeysFile, "utf-8"));
        for (const [apiKey, cfg] of Object.entries<any>(data)) {
            const exists = await pg.select().from(apiKeys).where(eq(apiKeys.apiKey, apiKey)).limit(1);
            if (exists.length) continue;
            if (typeof cfg?.channel !== "string") continue;
            await pg
                .insert(apiKeys)
                .values({
                    apiKey,
                    channel: cfg.channel,
                    projects: Array.isArray(cfg.projects)
                        ? cfg.projects.map(String)
                        : []
                })
                .onConflictDoNothing();

            console.log(`[Migration] ${cfg.channel} has had its api key that was subscribed to it migrated from json to pglite.`);
        }
    }
}

async function migrateProjectsFromSqlite() {
    const rows = db
        .query(`SELECT project_id, ids, ship_status FROM project_cache`)
        .all() as any[];

    for (const row of rows) {
        const exists = await pg
            .select({ projectId: projectData.projectId })
            .from(projectData)
            .where(eq(projectData.projectId, row.project_id))
            .limit(1);
        if (exists.length) continue;
        let ids: number[] = [];

        try {
            ids = JSON.parse(row.ids)
                .map(Number)
                .filter(Number.isFinite)
                .sort((a: number, b: number) => a - b);
        } catch { }

        await pg
            .insert(projectData)
            .values({
                projectId: row.project_id,
                ids,
                shipStatus: row.ship_status,
            })
            .onConflictDoUpdate({
                target: projectData.projectId,
                set: {
                    ids,
                    shipStatus: row.ship_status,
                },
            });
        console.log(`[PG Migration] Project ${row.project_id} has been migrated from sqlite to pg db`);
    }
}

async function migrateApiKeysFromSqlite() {
    const rows = db
        .query(`SELECT api_key, channel, projects FROM api_keys`)
        .all() as any[];

    for (const row of rows) {
        const exists = await pg
            .select({ apiKey: apiKeys.apiKey })
            .from(apiKeys)
            .where(eq(apiKeys.apiKey, row.api_key))
            .limit(1);
        if (exists.length) continue;
        let projects: string[] = [];
        try {
            projects = JSON.parse(row.projects);
        } catch { }

        await pg
            .insert(apiKeys)
            .values({
                apiKey: row.api_key,
                channel: row.channel,
                projects,
            })
            .onConflictDoNothing();
    }

    console.log("[PG Migration] api_keys migrated");
}

export default async function migration(): Promise<void> {
    if (await hasMigratedPg("api_keys") && await hasMigratedPg("projects")) return;
    const existingTables = db
        .prepare(
            `SELECT name FROM sqlite_master WHERE type = 'table'`
        )
        .all()
        .map((r: any) => r.name);

    const hasAllTables = ["api_keys", "project_cache"].every(t =>
        existingTables.includes(t)
    );

    if (hasAllTables) {
        if (await hasMigratedPg("api_keys")) {
            await migrateApiKeysFromSqlite()
        }

        if (await hasMigratedPg("projects")) {
            await migrateProjectsFromSqlite()
        }
    }

    const jsonFiles = fs.readdirSync(cacheDir).filter(f => f.endsWith(".json"));

    if (jsonFiles.length > 0) {
        await migrateFromJson();
    }

    markMigratedPg("projects");
    markMigratedPg("api_keys")
}

migration()