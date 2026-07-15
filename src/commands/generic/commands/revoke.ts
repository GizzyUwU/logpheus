import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq, inArray } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import * as schemas from "@/schema"

export default {
  name: "revoke",
  desc: "Withdraw your data from the bot :(",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, prefix, client, clients, userData, projects, yswsAll }: RequestHandler & { yswsAll: typeof schemas.yswsUsers.$inferSelect[] },
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

      if (!userData)
        return await respond({
          text: `You don't exist in the db so I can't revoke you.`,
          response_type: "ephemeral",
        });
      
      const projectIds = projects?.map((p) => p.id);

      if (Array.isArray(projectIds) && projectIds.length > 0) {
        await pg.delete(schemas.projects).where(inArray(schemas.projects.id, projectIds));
      }

      for (const yswsData of yswsAll) {
        if (yswsData?.apiKey && clients[`${yswsData.yswsId}:${yswsData?.apiKey}`]) {
          delete clients[`${yswsData.yswsId}:${yswsData?.apiKey}`];
        }
      }

      if (userData.hcbId) {
        await pg.delete(schemas.hcb).where(eq(schemas.hcb.userId, userData.hcbId));
      }
      
      await pg.delete(schemas.users).where(eq(schemas.users.userId, command.user_id));

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
