import type { AckFn, RespondArguments, RespondFn, Logger, SlashCommand } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { apiKeys } from "../schema/apiKeys";
import { eq, count } from "drizzle-orm";
export default {
    name: process.env.DEV_MODE === "true" ? '/devlpheus-stats' : '/logpheus-stats',
    execute: async ({ ack, respond, logger }: {
        command: SlashCommand,
        ack: AckFn<string | RespondArguments>,
        client: WebClient,
        respond: RespondFn,
        logger: Logger
    }, { pg }: {
        pg: PgliteDatabase<Record<string, never>> & {
            $client: PGlite;
        }
    }) => {
        try {
            const data = await pg
                .select()
                .from(apiKeys);
            const result = await pg
                .select({ count: count() })
                .from(apiKeys);
            const recordCount = result[0]?.count || 0;

            await respond({
                text: `There ${recordCount === 1 ? 'is' : 'are'} ${recordCount} record${recordCount === 1 ? '' : 's'} in the database indicating the amount of users.`,
                response_type: "ephemeral"
            });
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