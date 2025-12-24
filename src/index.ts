import { App, LogLevel } from "@slack/bolt";
import FT from "./lib/ft";
import fs from "fs";
import path from "path";
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

const cacheDir = path.join(__dirname, "../cache");
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

async function getNewDevlogs(apiKey: string, projectId: string) {
    const cacheFile = path.join(cacheDir, `${projectId}.json`);

    let cachedDevlogs: any[] = [];
    if (fs.existsSync(cacheFile)) {
        try {
            cachedDevlogs = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
        } catch (err) {
            console.error(`Error reading cache for project ${projectId}:`, err);
        }
    }

    try {
        const client = clients[apiKey];
        if (!client) return console.error(`No FT client for project ${projectId}`);

        const freshDevlogsRaw = await client.devlogs({ id: Number(projectId) });
        const freshDevlogs = Array.isArray(freshDevlogsRaw?.devlogs)
            ? freshDevlogsRaw.devlogs
            : [];

        if (!fs.existsSync(cacheFile)) {
            fs.writeFileSync(cacheFile, JSON.stringify(freshDevlogs, null, 2), "utf-8");
        }

        const cachedIds = new Set(cachedDevlogs.map(d => d.id));
        const newDevlogs = freshDevlogs.filter(d => !cachedIds.has(d.id));

        if (newDevlogs.length > 0) {
            fs.writeFileSync(cacheFile, JSON.stringify(freshDevlogs, null, 2), "utf-8");
            return newDevlogs;
        }

        return false;
    } catch (err) {
        console.error(`Error fetching devlogs for project ${projectId}:`, err);
        return false;
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
            const newDevlogs = await getNewDevlogs(apiKey, projectId);
            if (!newDevlogs || newDevlogs.length === 0) continue;

            for (const devlog of newDevlogs) {
                try {
                    const days = Math.floor(devlog.duration_seconds / (24 * 3600));
                    const hours = Math.floor((devlog.duration_seconds % (24 * 3600)) / 3600);
                    const minutes = Math.floor((devlog.duration_seconds % 3600) / 60);
                    let durationParts = [];
                    if (days > 0) durationParts.push(`${days} day${days > 1 ? 's' : ''}`);
                    if (hours > 0) durationParts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
                    if (minutes > 0) durationParts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
                    const durationString = durationParts.join(' ');

                    await app.client.chat.postMessage({
                        channel: data.channel,
                        text: `Woah new devlog for Project ${projectId}`,
                        blocks: [
                            {
                                type: "section",
                                text: {
                                    type: "mrkdwn",
                                    text: `Woah new devlog posted for <https://flavortown.hackclub.com/projects/${projectId}|Project ${projectId}>. Spent a total ${durationString}.`
                                }
                            }
                        ]
                    });
                } catch (err) {
                    console.error(`Error posting to Slack for project ${projectId}:`, err);
                }
            }
            await new Promise(res => setTimeout(res, 2000));

        }
    }
}

app.command('/logpheus-add', async ({ command, body, client, ack, respond, logger }) => {
    await ack();
    const channel = await app.client.conversations.info({
        channel: command.channel_id
    })
    if (!channel) throw new Error(`Command ran in channel that doesn't exist? ${command.channel_id}`);
    if (command.user_id !== channel.channel?.creator) return await respond("You can only run this command in a channel that you are the creator of");
    try {
        await client.views.open({
            trigger_id: body.trigger_id,
            view: {
                type: 'modal',
                callback_id: 'logpheus_add',
                title: {
                    type: 'plain_text',
                    text: command.channel_id
                },
                blocks: [
                    {
                        type: 'input',
                        block_id: 'projId',
                        label: {
                            type: 'plain_text',
                            text: "What is the project's id"
                        },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'proj_input',
                            multiline: false
                        }
                    },
                    {
                        type: 'input',
                        block_id: 'ftApiKey',
                        label: {
                            type: 'plain_text',
                            text: "What is your flavortown api key? (This is required everytime you submit a project)"
                        },
                        element: {
                            type: 'plain_text_input',
                            action_id: 'api_input',
                            multiline: false
                        }
                    }
                ],
                submit: {
                    type: 'plain_text',
                    text: 'Submit'
                }
            }
        });
    } catch (error) {
        logger.error(error);
    }
});

app.view('logpheus_add', async ({ ack, view }) => {
    const values = view.state.values;
    const projectId = values.projId?.proj_input?.value?.trim();
    const apiKey = values.ftApiKey?.api_input?.value?.trim();
    const channelId = view.title.text;
    if (!projectId) {
        await ack({
            response_action: 'errors',
            errors: {
                projId: 'Project ID is required'
            }
        });
        return;
    } else if (!apiKey) {
        await ack({
            response_action: 'errors',
            errors: {
                projId: 'Flavortown API key is required'
            }
        });
        return;
    }

    const apiKeys = loadApiKeys();
    if (!apiKeys[apiKey]) {
        apiKeys[apiKey] = {
            channel: channelId,
            projects: []
        };
    }

    if (apiKeys[apiKey].channel !== channelId) {
        await ack({
            response_action: 'errors',
            errors: {
                ftApiKey: 'This API key is already bound to a different channel'
            }
        });
        return;
    }

    if (apiKeys[apiKey].projects.includes(projectId)) {
        await ack({
            response_action: 'errors',
            errors: {
                projId: 'Project already registered'
            }
        });
        return;
    }

    await ack();

    apiKeys[apiKey].projects.push(projectId);
    fs.writeFileSync(apiKeysFile, JSON.stringify(apiKeys, null, 2), "utf-8");
    const client = new FT(apiKey)
    const freshDevlogsRaw = await client.devlogs({ id: Number(projectId) });
    const freshDevlogs = Array.isArray(freshDevlogsRaw?.devlogs)
        ? freshDevlogsRaw.devlogs
        : [];

    const cacheFile = path.join(cacheDir, `${projectId}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(freshDevlogs, null, 2), "utf-8");

    await app.client.chat.postMessage({
        channel: channelId,
        text: `Project ${projectId} successfully added`
    });
});

app.command('/logpheus-remove', async ({ command, ack, respond }) => {
    await ack();
    const channel = await app.client.conversations.info({
        channel: command.channel_id
    })
    if (!channel) throw new Error(`Command ran in channel that doesn't exist? ${command.channel_id}`);
    if (command.user_id !== channel.channel?.creator) return await respond("You can only run this command in a channel that you are the creator of");
    const apiKeys = loadApiKeys();
    const projectId = command.text.trim();

    if (projectId.length > 0) {
        if (!Number.isInteger(Number(projectId))) return await respond("Project ID must be a valid number.");
        for (const [apiToken, entry] of Object.entries(apiKeys)) {
            if (entry.projects.includes(projectId)) {
                entry.projects = entry.projects.filter(p => p !== projectId);

                if (entry.projects.length === 0) {
                    delete apiKeys[apiToken];
                    delete clients[apiToken];
                }

                delete apiKeys[projectId];
                fs.writeFileSync(apiKeysFile, JSON.stringify(apiKeys, null, 2), "utf-8");
                const cacheFilePath = path.join(cacheDir, `${projectId}.json`);

                if (fs.existsSync(cacheFilePath)) {
                    fs.unlinkSync(cacheFilePath);
                }

                await respond(`Removed project ${projectId} from list.`)
            }
        }
    } else {
        let foundKey: string | null = null;

        for (const [apiToken, entry] of Object.entries(apiKeys)) {
            if (entry.channel === command.channel_id) {
                foundKey = apiToken;
                break;
            }
        }

        if (!foundKey) return await respond("No API key found for this channel.");
        const entry = apiKeys[foundKey];

        delete apiKeys[foundKey];
        delete clients[foundKey];

        fs.writeFileSync(apiKeysFile, JSON.stringify(apiKeys, null, 2), "utf-8");
        return await respond("Removed all projects for this channel.");
    }
});

(async () => {
    try {
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
