import type { AckFn, RespondArguments, RespondFn, Logger, SlashCommand } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import FT from "../lib/ft";
import { apiKeys } from "../schema/apiKeys";
import { eq } from "drizzle-orm";
import { projectData } from "../schema/project";

export default {
    name: process.env.DEV_MODE === "true" ? '/devlpheus-remove' : '/logpheus-remove',
    execute: async ({ command, ack, client, respond, logger }: {
        command: SlashCommand,
        ack: AckFn<string | RespondArguments>,
        client: WebClient,
        respond: RespondFn,
        logger: Logger
    }, { pg, clients }: {
        pg: PgliteDatabase<Record<string, never>> & {
            $client: PGlite;
        }
        clients: Record<string, FT>;
    }) => {
        try {
            const channel = await client.conversations.info({
                channel: command.channel_id
            })
            if (!channel) return await respond({
                text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
                response_type: "ephemeral"
            })
            if (command.user_id !== channel.channel?.creator) return await respond({
                text: "You can only run this command in a channel that you are the creator of",
                response_type: "ephemeral"
            });
            const projectId = command.text.trim();
            const res = await pg.select().from(apiKeys).where(eq(apiKeys.channel, command.channel_id))
            if (res.length === 0) return await respond({
                text: `No API key found for this channel.`,
                response_type: "ephemeral"
            });
            const data = res[0];

            if (projectId.length > 0) {
                if (!Number.isInteger(Number(projectId))) return await respond({
                    text: "Project ID must be a valid number.",
                    response_type: "ephemeral"
                });

                if (!data?.projects.includes(Number(projectId))) return await respond({
                    text: "This project id isn't subscribed to this channel.",
                    response_type: "ephemeral"
                })

                const updatedProjects = data.projects.filter(p => p !== Number(projectId));
                if (updatedProjects.length > 0) {
                    await pg.update(apiKeys)
                        .set({
                            projects: updatedProjects
                        })
                        .where(eq(apiKeys.channel, command.channel_id));
                } else {
                    await pg.delete(apiKeys).where(eq(apiKeys.channel, command.channel_id));
                }

                if (clients[data.apiKey]) delete clients[data.apiKey];
                return await respond({
                    text: `Project ${projectId} has been disconnected from this channel.`,
                    response_type: "ephemeral"
                });
            } else {
                for (const pid of data?.projects!) {
                    await pg.delete(projectData).where(eq(projectData.projectId, Number(pid)));
                }

                await pg.delete(apiKeys).where(eq(apiKeys.channel, command.channel_id));
                if (clients[data!.apiKey]) delete clients[data!.apiKey];
                return await respond({
                    text: "All projects previously connected to this channel have been disconnected.",
                    response_type: "ephemeral"
                });
            }
        } catch (error: any) {
            if (error.code === "slack_webapi_platform_error" && error.data?.error === "channel_not_found") {
                await respond({
                    text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
                    response_type: "ephemeral"
                });
                return;
            } else {
                logger.error(error);
                await respond({
                    text: "An unexpected error occurred. Check logs.",
                    response_type: "ephemeral"
                });
            }
        }
    }
}