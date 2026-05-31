import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { and, eq } from "drizzle-orm";
import { yswsUsers } from "@/schema/ysws";
import ysws from "@/ysws";
type UserRow = typeof yswsUsers._.inferSelect;

export default {
  name: "reactivate",
  desc: "Got deactivated because of a bad config? Run this get reactivated!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { logger, client, pg, prefix, folder, yswsData }: RequestHandler,
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

      if (yswsData && Object.keys(yswsData).length === 0)
        return respond({
          text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
          response_type: "ephemeral",
        });

      const updateFields: Partial<UserRow> = {};
      if (yswsData?.disabled === false)
        return await respond({
          text: "Silly you can't be reactivated if you are already active! :agabounce:",
          response_type: "ephemeral",
        });

      updateFields.disabled = false;

      await pg
        .update(yswsUsers)
        .set(updateFields)
        .where(and(eq(yswsUsers.userId, command.user_id), eq(yswsUsers.yswsId, ysws.macondo.id)));

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
