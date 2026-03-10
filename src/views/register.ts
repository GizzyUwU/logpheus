import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import checkAPIKey from "../lib/apiKeyCheck";
type UserInsert = typeof users.$inferInsert;

export default {
  name: "register",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client }: RequestHandler,
  ): Promise<void | ChatPostEphemeralResponse> => {
    try {
      const channelId = JSON.parse(view.private_metadata).channel;
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
      const metaRegion = values["meta"]?.["region"]?.value?.trim();

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

      const apiKey = checkKey!;

      const exists = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.apiKey, apiKey));
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
      };

      if (metaRegion) {
        insertFields.meta = [...(insertFields.meta ?? []), "Region::" + metaRegion];
      }

      await pg.insert(users).values(insertFields);

      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        markdown_text: ":woah-dino: You sucessfully registered! :yay:",
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
