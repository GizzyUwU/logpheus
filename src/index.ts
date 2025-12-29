import { App, LogLevel } from "@slack/bolt";
import FT from "./lib/ft";
import fs from "fs";
import path from "path";
import type FTypes from "./lib/ft.d"
import { containsMarkdown, parseMarkdownToSlackBlocks } from "./lib/parseMarkdown";
const apiKeysFile = path.join(__dirname, "../cache/apiKeys.json");
const cacheDir = path.join(__dirname, "../cache");
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

async function migrateCache(): Promise<void> {
    if (!fs.existsSync(cacheDir)) return;

    const files = fs.readdirSync(cacheDir).filter(f => f.endsWith(".json"));

    for (const file of files) {
        const filePath = path.join(cacheDir, file);
        try {
            const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            let migrated: ProjectCache | null = null;

            if (Array.isArray(data)) {
                const ids = data.filter(x => typeof x === "number")
                    .concat(data.filter(x => x && typeof x.id === "number").map(x => x.id));

                migrated = { ids, ship_status: null };
            } else if (data.ids && Array.isArray(data.ids)) {
                continue;
            } else {
                continue;
            }

            fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
            console.log(`[Cache Migration] Migrated ${file}`);
        } catch (err) {
            console.error(`[Cache Migration] Failed to migrate ${file}:`, err);
        }
    }

    return;
}

let clients: Record<string, FT> = {};

function loadApiKeys(): Record<string, {
    channel: string;
    projects: string[];
}> {
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
    if (!fs.existsSync(apiKeysFile)) {
        fs.writeFileSync(apiKeysFile, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(apiKeysFile, "utf-8"));
}

async function getNewDevlogs(apiKey: string, projectId: string): Promise<{ name: string, devlogs: FTypes.Devlog[], shipped?: "pending" | "submitted" } | void> {
    const cacheFile = path.join(cacheDir, `${projectId}.json`);

    let cachedData: any = { ids: [], ship_status: null };
    if (fs.existsSync(cacheFile)) {
        try {
            cachedData = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
        } catch (err) {
            console.error(`Error reading cache for project ${projectId}:`, err);
        }
    }

    try {
        const client = clients[apiKey];
        if (!client) return console.error(`No FT client for project ${projectId}`);

        const project = await client.project({ id: Number(projectId) });
        if (!project) return console.error("No project exists at id", projectId)
        const devlogIds = Array.isArray(project?.devlog_ids) ? project.devlog_ids : [];
        const cachedSet = new Set(cachedData.ids);
        const newIds = devlogIds.filter(id => !cachedSet.has(id));
        if (newIds.length === 0) {
            let shipped: "pending" | "submitted" | undefined = undefined;
            if (project.ship_status && project.ship_status !== "draft") {
                if (cachedData.ship_status !== project.ship_status) {
                    shipped = project.ship_status as "pending" | "submitted";
                    cachedData.ship_status = project.ship_status || cachedData.ship_status;
                    fs.writeFileSync(cacheFile, JSON.stringify(cachedData, null, 2));
                }
            }

            return { name: project.title, devlogs: [], ...(shipped ? { shipped } : {}) }
        }

        const devlogs: any[] = [];
        for (const id of newIds) {
            const res = await client.devlog({ projectId: Number(projectId), devlogId: id });
            if (res) devlogs.push(res);
        }

        let shipped: "pending" | "submitted" | undefined;
        if (project.ship_status && project.ship_status !== "draft") {
            if (cachedData.ship_status !== project.ship_status) {
                shipped = project.ship_status as "pending" | "submitted";
            }
        }

        if (cachedData.ids.length === 0) {
            cachedData.ids.push(...newIds);
            cachedData.ship_status = project.ship_status || cachedData.ship_status;
            fs.writeFileSync(cacheFile, JSON.stringify(cachedData, null, 2));
            return;
        } else {
            cachedData.ids.push(...newIds);
            cachedData.ship_status = project.ship_status || cachedData.ship_status;
            fs.writeFileSync(cacheFile, JSON.stringify(cachedData, null, 2));
            return { name: project.title, devlogs, ...(shipped ? { shipped } : {}) }
        }
    } catch (err) {
        console.error(`Error fetching devlogs for project ${projectId}:`, err);
        return;
    }
}

async function checkAllProjects() {
    const apiKeys = loadApiKeys();
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
                await module.execute(args, { loadApiKeys });
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
        await migrateCache()
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

        checkAllProjects()
        setInterval(checkAllProjects, 60 * 1000);
    } catch (error) {
        console.error('Unable to start app:', error);
    }
})();
