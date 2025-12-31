import type { AckFn, RespondArguments, Logger, SlashCommand, RespondFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { apiKeys } from "../schema/apiKeys";
import { eq } from "drizzle-orm";

export default {
    name: process.env.DEV_MODE === "true" ? '/devlpheus-config' : '/logpheus-config',
    execute: async ({ command, ack, client, logger, respond }: {
        command: SlashCommand,
        ack: AckFn<string | RespondArguments>,
        client: WebClient,
        logger: Logger
        respond: RespondFn
    }, { pg }: {
        pg: PgliteDatabase<Record<string, never>> & {
            $client: PGlite;
        }
    }) => {
        await ack();
        try {
            const channel = await client.conversations.info({
                channel: command.channel_id
            })
            if (!channel || !channel.channel || Object.keys(channel).length === 0 || !channel.ok) return await respond({
                text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
                response_type: "ephemeral"
            })
            if (!channel?.channel.id) return console.error("no channel id?", channel)
            if (command.user_id !== channel.channel?.creator) return await respond({
                text: "You can only run this command in a channel that you are the creator of",
                response_type: "ephemeral"
            });
            const res = await pg.select().from(apiKeys).where(eq(apiKeys.channel, channel.channel.id))
            if (res.length === 0) return await respond({
                text: "Gng you don't even got an api key set to this channel run /logpheus-add first.",
                response_type: "ephemeral"
            })
            await client.views.open({
                trigger_id: command.trigger_id,
                view: {
                    type: 'modal',
                    callback_id: 'logpheus_config',
                    title: {
                        type: 'plain_text',
                        text: command.channel_id
                    },
                    blocks: [
                        {
                            type: "section",
                            block_id: "user_id",
                            text: {
                                type: "plain_text",
                                text: "User: " + command.user_id
                            },
                        },
                        {
                            type: 'input',
                            block_id: 'ftApiKey',
                            label: {
                                type: 'plain_text',
                                text: "What is the new flavortown api key?"
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
        } catch (error: any) {
            if (error.code === "slack_webapi_platform_error" && error.data?.error === "channel_not_found") {
                await ack("If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND");
                return;
            } else {
                logger.error(error);
                await ack("An unexpected error occurred. Check logs.");
            }
        }
    }
};
