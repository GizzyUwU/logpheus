import { App, LogLevel } from "@slack/bolt";
import FT from "./lib/ft";
import fs from "fs";
import path from "path";
import type FTypes from "./lib/ft.d"
import { containsMarkdown, parseMarkdownToSlackBlocks } from "./lib/parseMarkdown";
import { Database } from "bun:sqlite";
import { eq } from "drizzle-orm";
import { apiKeys } from "./schema/apiKeys";
import { metadata } from "./schema/meta";
import { projectData } from "./schema/project";
import { migration } from "./migration";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
type DatabaseType =
    | (NodePgDatabase<Record<string, never>> & { $client: Pool })
    | (PgliteDatabase<Record<string, never>> & { $client: PGlite });
const cacheDir = path.join(__dirname, "../cache");
let pg: DatabaseType;

if (process.env.PGLITE === "false") {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({
        connectionString: process.env.DB_URL
    })
    pg = drizzle({
        client: pool,
        casing: 'snake_case'
    })
} else {
    const { drizzle } = await import("drizzle-orm/pglite");
    const pgClient = new PGlite(path.join(cacheDir, "pg"));
    pg = drizzle({
        client: pgClient,
        casing: 'snake_case'
    })
}
const apiKeysFile = path.join(__dirname, "../cache/apiKeys.json");
const app = new App({
    signingSecret: process.env.SIGNING_SECRET,
    token: process.env.BOT_TOKEN,
    appToken: process.env.APP_TOKEN,
    socketMode: process.env.APP_TOKEN ? process.env.SOCKET_MODE === "true" : false,
    customRoutes: [
        {
            path: '/healthcheck',
            method: ['GET'],
            handler: (req, res) => {
                res.writeHead(200);
                res.end("I'm okay!");
            }
        }
    ]
});

interface ProjectCache {
    ids: number[];
    ship_status?: "pending" | "submitted" | null;
}

let clients: Record<string, FT> = {};

async function loadApiKeys(): Promise<Record<string, { channel: string; projects: string[] }>> {
    const result: Record<string, { channel: string; projects: string[] }> = {};
    const rows = await pg.select().from(apiKeys);
    for (const row of rows) {
        try {
            const projects = row.projects;
            result[row.apiKey] = {
                channel: row.channel,
                projects: Array.isArray(projects) ? projects.map(String) : []
            };
        } catch (err) {
            console.error(`[loadApiKeys] Failed to parse projects for API key ${row.apiKey}:`, err);
            result[row.apiKey] = { channel: row.channel, projects: [] };
        }
    }

    return result;
}

async function getNewDevlogs(
    apiKey: string,
    projectId: string
): Promise<{ name: string; devlogs: FTypes.Devlog[]; shipped?: "pending" | "submitted" } | void> {
    try {
        const client = clients[apiKey];
        if (!client) return console.error(`No FT client for project ${projectId}`);
        const project = await client.project({ id: Number(projectId) });
        if (!project) return console.error("No project exists at id", projectId);

        const devlogIds = Array.isArray(project?.devlog_ids) ? project.devlog_ids : [];

        const row = await pg.select()
            .from(projectData)
            .where(eq(projectData.projectId, Number(projectId)));

        let cachedIds: string[] = [];
        let cachedShipStatus: "pending" | "submitted" | null = null;

        if (row.length > 0) {
            try {
                cachedIds = row[0]!.ids.map(String);
            } catch {
                cachedIds = [];
            }
            cachedShipStatus = (row[0]?.shipStatus === "pending" || row[0]?.shipStatus === "submitted")
                ? row[0]!.shipStatus as "pending" | "submitted"
                : null;
        }

        const cachedSet = new Set(cachedIds);
        const newIds = devlogIds.filter(id => !cachedSet.has(String(id)));

        let shipped: "pending" | "submitted" | undefined;
        if (project.ship_status && project.ship_status !== "draft" && cachedShipStatus !== project.ship_status) {
            shipped = project.ship_status as "pending" | "submitted";
        }

        if (newIds.length > 0 || shipped) {
            await pg.update(projectData)
                .set({
                    ids: Array.from(new Set([...cachedIds, ...newIds])),
                    shipStatus: shipped ?? cachedShipStatus
                })
                .where(eq(projectData.projectId, Number(projectId)));
        }

        if (newIds.length === 0) {
            return { name: project.title, devlogs: [], ...(shipped ? { shipped } : {}) };
        }

        const devlogs: FTypes.Devlog[] = [];
        for (const id of newIds) {
            const res = await client.devlog({ projectId: Number(projectId), devlogId: id });
            if (res) devlogs.push(res);
        }

        return { name: project.title, devlogs, ...(shipped ? { shipped } : {}) };

    } catch (err) {
        console.error(`Error fetching devlogs for project ${projectId}:`, err);
        return;
    }
}

async function checkAllProjects() {
    const apiKeys = await loadApiKeys();
    if (!apiKeys) return;
    for (const [apiKey] of Object.entries(apiKeys)) {
        if (!clients[apiKey]) {
            clients[apiKey] = new FT(apiKey);
        }
    }

    for (const [apiKey, data] of Object.entries(apiKeys)) {
        for (const projectId of data.projects) {
            const projData = await getNewDevlogs(apiKey, projectId);
            if (!projData) continue;
            if (projData.devlogs.length > 0) {
                for (const devlog of projData.devlogs) {
                    try {
                        const days = Math.floor(devlog.duration_seconds / (24 * 3600));
                        const hours = Math.floor((devlog.duration_seconds % (24 * 3600)) / 3600);
                        const minutes = Math.floor((devlog.duration_seconds % 3600) / 60);
                        let durationParts = [];
                        if (days > 0) durationParts.push(`${days} day${days > 1 ? 's' : ''}`);
                        if (hours > 0) durationParts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
                        if (minutes > 0) durationParts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
                        const durationString = durationParts.join(' ');
                        const createdAt = new Date(devlog.created_at);
                        const timestamp = createdAt.toLocaleString('en-GB', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                            timeZone: 'UTC'
                        });
                        const year = createdAt.getUTCFullYear();
                        const month = (createdAt.getUTCMonth() + 1).toString().padStart(2, '0');
                        const day = createdAt.getUTCDate().toString().padStart(2, '0');
                        const cHours = createdAt.getUTCHours().toString().padStart(2, '0');
                        const cMinutes = createdAt.getUTCMinutes().toString().padStart(2, '0');
                        const cs50Timestamp = `${year}${month}${day}T${cHours}${cMinutes}+0000`;

                        if (!containsMarkdown(devlog.body)) {
                            await app.client.chat.postMessage({
                                channel: data.channel,
                                unfurl_links: false,
                                unfurl_media: false,
                                blocks: [
                                    {
                                        type: "section",
                                        text: {
                                            type: "mrkdwn",
                                            text: `:shipitparrot: <https://flavortown.hackclub.com/projects/${projectId}|${projData.name}> got a new devlog posted! :shipitparrot:`
                                        }
                                    },
                                    {
                                        type: "section",
                                        text: {
                                            type: "mrkdwn",
                                            text: `> ${devlog.body}`
                                        }
                                    },
                                    {
                                        "type": "divider"
                                    },
                                    {
                                        "type": "context",
                                        "elements": [
                                            {
                                                "type": "mrkdwn",
                                                "text": `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}.`
                                            }
                                        ]
                                    }
                                ]
                            });
                        } else {
                            await app.client.chat.postMessage({
                                channel: data.channel,
                                unfurl_links: false,
                                unfurl_media: false,
                                blocks: [
                                    {
                                        type: "section",
                                        text: {
                                            type: "mrkdwn",
                                            text: `:shipitparrot: <https://flavortown.hackclub.com/projects/${projectId}|${projData.name}> got a new devlog posted! :shipitparrot:`
                                        }
                                    },
                                    ...parseMarkdownToSlackBlocks(devlog.body),
                                    {
                                        "type": "divider"
                                    },
                                    {
                                        "type": "context",
                                        "elements": [
                                            {
                                                "type": "mrkdwn",
                                                "text": `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}.`
                                            }
                                        ]
                                    }
                                ]
                            });
                        }
                        console.log(`[Devlog Notification] New devlog for project ${projectId} skipped (Markdown detection is disabled).`);
                    } catch (err) {
                        console.error(`Error posting to Slack for project ${projectId}:`, err);
                    }
                }
            }
            if (projData.shipped) {
                switch (projData.shipped) {
                    case "pending":
                        await app.client.chat.postMessage({
                            channel: data.channel,
                            unfurl_links: false,
                            unfurl_media: false,
                            blocks: [
                                {
                                    type: "section",
                                    text: {
                                        type: "mrkdwn",
                                        text: `:shipitparrot: <https://flavortown.hackclub.com/projects/${projectId}|${projData.name}> just got shipped and now is pending a ship review! :shipitparrot:`
                                    }
                                },
                            ]
                        });
                        return;
                    case "submitted":
                        await app.client.chat.postMessage({
                            channel: data.channel,
                            unfurl_links: false,
                            unfurl_media: false,
                            blocks: [
                                {
                                    type: "section",
                                    text: {
                                        type: "mrkdwn",
                                        text: `:shipitparrot: <https://flavortown.hackclub.com/projects/${projectId}|${projData.name}> ship has got accepted and now has entered voting! :shipitparrot:`
                                    }
                                },
                            ]
                        });
                        return;
                }
            }
            await new Promise(res => setTimeout(res, 2000));
            continue;
        }
    }
}

function loadHandlers(app: App, folder: string, type: "command" | "view") {
    const folderPath = path.join(__dirname, folder);
    fs.readdirSync(folderPath).forEach(file => {
        if (!file.endsWith(".ts") && !file.endsWith(".js")) return;

        const module = require(path.join(folderPath, file)).default;

        if (!module?.name || typeof module.execute !== "function") return;

        // @ts-ignore
        app[type](module.name, async (args) => {
            try {
                await module.execute(args, { loadApiKeys, pg, clients });
            } catch (err) {
                console.error(`Error executing ${type} ${module.name}:`, err);
            }
        });

        console.log(`[Logpheus] Registered ${type}: ${module.name}`);
    });
}

loadHandlers(app, "commands", "command");
loadHandlers(app, "views", "view");

(async () => {
    try {
        await migration(pg);
        app.logger.setName("[Logpheus]")
        app.logger.setLevel('error' as LogLevel);

        if (process.env.SOCKET_MODE === "true" && process.env.APP_TOKEN) {
            await app.start();
            console.info('[Logpheus] Running as Socket Mode');
        } else {
            const port = process.env.PORT ? parseInt(process.env.PORT) : 3000
            await app.start(port);
            console.info('[Logpheus] Running on port:', port);
        }

        await checkAllProjects()
        setInterval(checkAllProjects, 60 * 1000);
    } catch (error) {
        console.error('Unable to start app:', error);
    }
})();
