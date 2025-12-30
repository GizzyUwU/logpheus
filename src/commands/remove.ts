import type { AckFn, RespondArguments, RespondFn, Logger, SlashCommand } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import fs from "node:fs";
import path from "node:path";
import type { Database } from "bun:sqlite"
import FT from "../lib/ft";

export default {
    name: process.env.DEV_MODE === "true" ? '/devlpheus-remove' : '/logpheus-remove',
    execute: async ({ command, ack, client, respond, logger }: {
        command: SlashCommand,
        ack: AckFn<string | RespondArguments>,
        client: WebClient,
        respond: RespondFn,
        logger: Logger
    }, { db, clients }: {
        db: Database;
        clients: Record<string, FT>;
    }) => {
        try {
            const channel = await client.conversations.info({
                channel: command.channel_id
            })
            if (!channel) return await ack("If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND")
            if (command.user_id !== channel.channel?.creator) return await ack("You can only run this command in a channel that you are the creator of");
            const projectId = command.text.trim();

            if (projectId.length > 0) {
                if (!Number.isInteger(Number(projectId))) return await ack("Project ID must be a valid number.");
                await ack();
                const rows = db.query(`SELECT * FROM api_keys`).all() as { api_key: string; channel: string; projects: string }[];
                for (const row of rows) {
                    const projects: string[] = JSON.parse(row.projects);
                    if (projects.includes(projectId)) {
                        if (clients[row.api_key]) delete clients[row.api_key];
                        const updatedProjects = projects.filter(p => p !== projectId);
                        if (updatedProjects.length > 0) {
                            db.run(`UPDATE api_keys SET projects = ? WHERE api_key = ?`, [JSON.stringify(updatedProjects), row.api_key]);
                        } else {
                            db.run(`DELETE FROM api_keys WHERE api_key = ?`, [row.api_key]);
                        }

                        db.run(`DELETE FROM project_cache WHERE project_id = ?`, [projectId]);
                        if (clients[row.api_key]) delete clients[row.api_key];
                        return await respond({ text: `Project ${projectId} has been disconnected from this channel.`, response_type: "ephemeral" });
                    }
                }
            } else {
                const row = db.query(`SELECT * FROM api_keys WHERE channel = ?`).get(command.channel_id) as { api_key: string; projects: string } | undefined;
                if (!row) return await ack("No API key found for this channel.");
                await ack()
                if (clients[row.api_key]) delete clients[row.api_key];

                const projects: string[] = JSON.parse(row.projects);
                for (const pid of projects) {
                    db.run(`DELETE FROM project_cache WHERE project_id = ?`, [pid]);
                }

                db.run(`DELETE FROM api_keys WHERE api_key = ?`, [row.api_key]);
                if (clients[row.api_key]) delete clients[row.api_key];
                return await respond({ text: "All projects previously connected to this channel have been disconnected.", response_type: "ephemeral" });
            }
        } catch (error: any) {
            if (error.code === "slack_webapi_platform_error" && error.data?.error === "channel_not_found") {
                await ack("If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND");
                return;
            }

            logger.error(error);
            await ack("An unexpected error occurred. Check logs.");
        }
    }
}