import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { DatabaseType, RequestHandler } from "@/index.ts";
import { users } from "@/schema/users";
import { eq } from "drizzle-orm";
type UserInsert = typeof users.$inferInsert;

async function genAPIKey(pg: DatabaseType): Promise<string> {
  while (true) {
    const key = "logpheus_sk_" + crypto.randomUUID().replace(/-/g, "");
    const exists = await pg
      .select()
      .from(users)
      .where(eq(users.apiKey, key))
      .limit(1);
    if (exists.length === 0) return key;
  }
}

export default {
  name: "register",
  desc: "Register to use the bot!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, client, userData, prefix }: RequestHandler,
  ) => {
    try {
      const channel = await client.conversations.info({
        channel: command.channel_id,
      });
      if (
        !channel ||
        !channel.channel ||
        Object.keys(channel).length === 0 ||
        !channel.ok
      )
        return await respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
      if (!channel?.channel.id) {
        logger.error("There is no channel id for this channel?");
        return;
      }

      if (userData && Object.keys(userData).length > 0)
        return await respond({
          text:
            "You already got an api key setup in db. Run /" +
            prefix +
            "-config to change it",
          response_type: "ephemeral",
        });

      const insertFields: UserInsert = {
        apiKey: await genAPIKey(pg),
        userId: command.user_id,
        disabled: false,
      };

      await pg.insert(users).values(insertFields);

      await respond({
        markdown_text: "Yay! You are now a user of logpheus! :yay-nb:",
        response_type: "ephemeral"
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
