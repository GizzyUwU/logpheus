import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { yswsUsers } from "@/schema/ysws";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import checkAPIKey from "@/lib/ft/apiKeyCheck";
import { users } from "@/schema/users";
type UserInsert = typeof yswsUsers.$inferInsert;

export default {
  name: "register",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, yswsData, userData, yswsId }: RequestHandler & { yswsId: number },
  ): Promise<void | ChatPostEphemeralResponse> => {
    try {
      const metadata = JSON.parse(view.private_metadata);
      const channelId = metadata.channel;
      const userId = body.user.id;

      if (!channelId || !userId) {
        const ctx = logger.with({
          view,
        });
        if (!channelId) {
          ctx.error("There is no channel id for this channel?");
        } else {
          ctx.error("There is no user id for this user?");
        }

        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "An unexpected error occurred!",
        });
      }

      const values = view.state.values;
      const checkKey = values["ftApiKey"]?.["api_input"]?.value?.trim();
      const regionOpt =
        values?.["personal"]?.["region"]?.selected_option?.value?.trim();
      
      const working = await checkAPIKey({
        db: pg,
        apiKey: checkKey,
        logger,
        register: true,
      });
      if (!working.works)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API Key is invalid, provide a valid one.",
        });
      
      if(yswsData && Object.keys(yswsData).length > 0)  return await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "You are already registered to this YSWS.",
      });

      const apiKey = checkKey!;

      const exists = await pg
        .select()
        .from(yswsUsers)
        .limit(1)
        .where(
          and(
            eq(yswsUsers.apiKey, apiKey),
            eq(yswsUsers.yswsId, yswsId),
          ),
        );
      
      if (exists.length > 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "This API key is already bound to a user.",
        });

      const insertFields: UserInsert = {
        apiKey,
        userId,
        disabled: false,
        region: regionOpt ?? "us",
        yswsId: yswsId
      };

      await pg.insert(yswsUsers).values(insertFields);
      await pg
        .update(users)
        .set({
          ysws: [...(userData?.ysws ?? []), yswsId],
        })
        .where(eq(users.userId, userId));
      
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        markdown_text: "You are now able to use all Flavortown based commands! :yay:",
      });
    } catch (err) {
      const ctx = logger.with({
        data: {
          channel: JSON.parse(view.private_metadata).channel ?? "",
          user: body.user.id ?? "",
        },
      });
      ctx.error("Unexpected error occurred", {
        error: err,
      });
      await client.chat.postEphemeral({
        channel: JSON.parse(view.private_metadata).channel ?? "",
        user: body.user.id ?? "",
        text: "An unexpected error occurred!",
      });
    }
  },
};
