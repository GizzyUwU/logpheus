import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { eq } from "drizzle-orm";
import checkAPIKey from "@/lib/ft/apiKeyCheck";
import { yswsUsers } from "@/schema/ysws";
import { loadAdapter } from "@/lib/adapters";
import ysws from "@/ysws";
type UserRow = typeof yswsUsers._.inferSelect;

export default {
  name: "reactivate",
  desc: "Got deactivated because of a bad config? Run this get reactivated!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { logger, client, clients, pg, prefix, folder, yswsData }: RequestHandler,
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
      const apiKey = String(yswsData?.apiKey);
      const working = await checkAPIKey({
        db: pg,
        apiKey,
        logger,
        yswsData: yswsData!,
        allowTheDisabled: true,
        userId: command.user_id,
      });

      if (!working.works)
        return respond({
          text: "Flavortown API Key is invalid, provide a valid one.",
          response_type: "ephemeral",
        });

      if (yswsData?.disabled === false)
        return await respond({
          text: "Silly you can't be reactivated if you are already active! :agabounce:",
          response_type: "ephemeral",
        });

      updateFields.disabled = false;

      const AdapterClass = await loadAdapter(ysws.flavortown.adapter);
      const adapter = new AdapterClass(apiKey, logger);
      clients[`${yswsData?.yswsId}:${yswsData?.userId}`] = adapter;

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
