import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "..";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import checkAPIKey from "../lib/apiKeyCheck";
import FT from "../lib/ft";
type UserRow = typeof users._.inferSelect;

export default {
  name: "reactivate",
  desc: "Got deactivated because of a bad config? Run this get reactivated!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { logger, client, clients, pg, prefix }: RequestHandler,
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

      if (command.channel_id !== userData[0]?.channel)
        return respond({
          text: `Please run this in the channel that ${prefix} is setup to post in.`,
          response_type: "ephemeral",
        });

      const checkKey = String(userData[0]?.apiKey);
      const working = await checkAPIKey({
        db: pg,
        apiKey: checkKey,
        logger,
        allowTheDisabled: true,
        userId: command.user_id
      });
      if (!working.works)
        return respond({
          text: "Flavortown API Key is invalid, provide a valid one.",
          response_type: "ephemeral",
        });

      if (working.row![0]?.disabled === false)
        return await respond({
          text: "Silly you can't be reactivated if you are already active!",
          response_type: "ephemeral",
        });

      const apiKey = checkKey!;
      updateFields.disabled = false;
      clients[apiKey] = new FT(apiKey, logger);
      await pg
        .update(users)
        .set(updateFields)
        .where(eq(users.userId, command.user_id));

      return respond({
        text: "You have been reactivated!",
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
