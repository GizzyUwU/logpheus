import type { AckFn, ViewOutput, RespondArguments } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import FT from "../lib/ft";
import type FTypes from "../lib/ft"
import fs from "node:fs";
import path from "node:path";

export default {
    name: "logpheus_add",
    execute: async ({ ack, view, client }: {
        ack: AckFn<string | RespondArguments>
        view: ViewOutput
        client: WebClient
    }, { loadApiKeys }: {
        loadApiKeys: () => Record<string, {
            channel: string;
            projects: string[];
        }>
    }) => {
        const values = view.state.values;
        const projectId = values.projId?.proj_input?.value?.trim();
        const apiKey = values.ftApiKey?.api_input?.value?.trim();
        const channelId = view.title.text;
        if (!projectId) {
            await ack('Project ID is required');
            return;
        } else if (!apiKey) {
            await ack('Flavortown API key is required');
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
            await ack('This API key is already bound to a different channel');
            return;
        }

        if (apiKeys[apiKey].projects.includes(projectId)) {
            await ack('Project already registered');
            return;
        }

        await ack();

        apiKeys[apiKey].projects.push(projectId);
        fs.writeFileSync(path.join(__dirname, "../../cache/apiKeys.json"), JSON.stringify(apiKeys, null, 2), "utf-8");
        const ftClient = new FT(apiKey)
        const freshProject = await ftClient.project({ id: Number(projectId) });
        if (!freshProject) return;

        const cacheData = {
            ids: Array.isArray(freshProject.devlog_ids)
                ? freshProject.devlog_ids
                : [],
            ship_status: typeof freshProject.ship_status === "string"
                ? freshProject.ship_status
                : null
        };

        const cacheFile = path.join(path.join(__dirname, "../../cache"), `${projectId}.json`);
        fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), "utf-8");

        await client.chat.postMessage({
            channel: channelId,
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `:woah-dino: <https://flavortown.hackclub.com/projects/${projectId}|${freshProject.title}'s> devlogs just got subscribed to the channel. :yay:`
                    }
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `> ${freshProject.description}`
                    }
                }
            ]
        });
    }
};
