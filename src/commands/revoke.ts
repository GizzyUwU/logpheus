import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq, inArray } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import { projects } from "../schema/projects";

export default {
    name: "revoke",
    execute: async (
        { command, respond }: SlackCommandMiddlewareArgs,
        { pg, logger, prefix, client, clients }: RequestHandler,
    ) => {
        try {
            const channel = await client.conversations.info({
                channel: command.channel_id,
            });
            if (!channel)
                return await respond({
                    text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
                    response_type: "ephemeral",
                });

            const res = await pg
                .select()
                .from(users)
                .where(eq(users.userId, command.user_id));
            if (res.length === 0)
                return await respond({
                    text: `You don't exist in the db so I can't revoke you.`,
                    response_type: "ephemeral",
                });
            const projectIds = res[0]?.projects;

            if (Array.isArray(projectIds) && projectIds.length > 0) {
                await pg.delete(projects).where(inArray(projects.id, projectIds));
            }

            if(res[0]?.apiKey && clients[res[0]?.apiKey]) {
                delete clients[res[0]?.apiKey]
            }

            await pg.delete(users).where(eq(users.userId, command.user_id));

            return await respond({
                text: `You're data has completely been wiped from ${prefix}! Sad to see you go :(`,
                response_type: "ephemeral",
            });

        } catch (error: any) {
            if (
                error.code === "slack_webapi_platform_error" &&
                error.data?.error === "channel_not_found"
            ) {
                await respond({
                    text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
                    response_type: "ephemeral",
                });
                return;
            } else {
                logger.error({ error });

                await respond({
                    text: "An unexpected error occurred!",
                    response_type: "ephemeral",
                });
            }
        }
    },
};
