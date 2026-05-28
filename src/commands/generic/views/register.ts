import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { users } from "@/schema/users";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
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
      const regionOpt =
        values?.["personal"]?.["region"]?.selected_option?.value?.trim();
      const exists = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, userId));
      if (exists.length > 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "You already exist in the database!",
        });

      const insertFields: UserInsert = {
        userId,
        region: regionOpt ?? "us",
        disabled: false,
      };

      await pg.insert(users).values(insertFields);

      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        markdown_text: "Yay! You are now a user of logpheus! :yay-nb:",
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
