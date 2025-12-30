import type { AckFn, ViewOutput, RespondArguments } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import FT from "../lib/ft";
import type FTypes from "../lib/ft"
import fs from "node:fs";
import path from "node:path";
import type { Database } from "bun:sqlite"

export default {
    name: "logpheus_add",
    execute: async ({ ack, view, client }: {
        ack: AckFn<string | RespondArguments>
        view: ViewOutput
        client: WebClient
    }, { db }: { db: Database }) => {
        const values = view.state.values;
        const projectId = values.projId?.proj_input?.value?.trim();
        const apiKey = values.ftApiKey?.api_input?.value?.trim();
        const channelId = view.title.text;
        if (!projectId) return await ack('Project ID is required');
        if (!apiKey) return await ack('Flavortown API key is required');

        const existingRow = db.query(`SELECT * FROM api_keys WHERE api_key = ?`).get(apiKey) as { channel: string; projects: string; api_key: string } | undefined;
        let projects: string[] = [];
        if (existingRow) {
            if (existingRow.channel !== channelId) return await ack('This API key is already bound to a different channel');
            projects = JSON.parse(existingRow.projects);
            if (projects.includes(projectId)) return await ack('Project already registered');
        }

        await ack();

        projects.push(projectId);
        db.run(`
            INSERT OR REPLACE INTO api_keys (api_key, channel, projects)
            VALUES (?, ?, ?)
        `, [apiKey, channelId, JSON.stringify(projects)]);

        const ftClient = new FT(apiKey)
        const freshProject = await ftClient.project({ id: Number(projectId) });
        if (!freshProject) return;

        const insertProject = db.prepare(`
            INSERT OR IGNORE INTO project_cache (project_id, ids, ship_status)
            VALUES (?, ?, ?)
        `);

        const ids = Array.isArray(freshProject.devlog_ids) ? freshProject.devlog_ids : [];
        const shipStatus = typeof freshProject.ship_status === "string" ? freshProject.ship_status : null;
        insertProject.run(projectId, JSON.stringify(ids), shipStatus);

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
