import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "..";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import checkAPIKey from "../lib/apiKeyCheck";
type UserRow = typeof users._.inferSelect;

export default {
  name: "move",
  params: "[channelId]",
  desc: "Move the devlog posts to a different channel!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { logger, client, pg, prefix }: RequestHandler,
  ) => {
    try {
      const channelId = command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim();
      const channel = await client.conversations.info({
        channel: command.channel_id,
      });
      const newChannel = await client.conversations.info({
        channel: channelId,
      });
      if (!channel)
        return await respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
      if (command.user_id !== channel.channel?.creator)
        return await respond({
          text: "You can only run this command in a channel that you are the creator of",
          response_type: "ephemeral",
        });
      if (command.user_id !== newChannel.channel?.creator)
        return await respond({
          text: "You can only run this command to move to channel you own",
          response_type: "ephemeral",
        });

      const updateFields: Partial<UserRow> = {};
      const userData = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, command.user_id));

      if (userData.length === 0)
        return await respond({
          text: `Run /${prefix}-register first to be able to run this command.`,
          response_type: "ephemeral",
        });

      const checkKey = String(userData[0]?.apiKey);

      const working = await checkAPIKey({
        db: pg,
        apiKey: checkKey,
        logger,
      });
      if (!working.works)
        return respond({
          text: "Flavortown API Key is invalid, provide a valid one.",
          response_type: "ephemeral",
        });

      if (!userData[0]?.userId) {
        updateFields.userId = command.user_id;
      }

      updateFields.channel = channelId;

      await pg
        .update(users)
        .set(updateFields)
        .where(eq(users.userId, command.user_id));

      await respond({
        response_type: "ephemeral",
        text: "Moved successfully",
      });

      return client.chat.postMessage({
        unfurl_links: false,
        unfurl_media: false,
        channel: channelId,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:woah-dino: Devlog Posts moved to here! :yay:`,
            },
          },
        ],
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
