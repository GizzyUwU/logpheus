import type { AckFn, RespondArguments, RespondFn, Logger, SlashCommand } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { Database } from "bun:sqlite"
export default {
    name: process.env.DEV_MODE === "true" ? '/devlpheus-stats' : '/logpheus-stats',
    execute: async ({ command, ack, client, respond, logger }: {
        command: SlashCommand,
        ack: AckFn<string | RespondArguments>,
        client: WebClient,
        respond: RespondFn,
        logger: Logger
    }, { loadApiKeys, db }: {
        loadApiKeys: () => Record<string, {
            channel: string;
            projects: string[];
        }>;
        db: Database;
    }) => {
        try {
            await ack();
            const result = db.query(`SELECT COUNT(*) AS count FROM api_keys`).get() as { count: number };
            const recordCount = result?.count || 0;

            await respond({
                text: `There ${recordCount === 1 ? 'is' : 'are'} ${recordCount} record${recordCount === 1 ? '' : 's'} in the database indicating the amount of users.`,
                response_type: "ephemeral"
            });
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