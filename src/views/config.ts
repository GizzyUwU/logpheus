import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { eq } from "drizzle-orm";
import FT from "../lib/ft";
import { users } from "../schema/users";
import type { RequestHandler } from "..";

export default {
  name: "config",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, clients }: RequestHandler,
  ) => {
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
      const apiKey = values.ftApiKey?.api_input?.value?.trim();
      if (!apiKey)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API key is required",
        });
      if (apiKey.startsWith("ft_sk_") === false)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API key is invalid every api key should start with ft_sk_",
        });
      const ftClient = new FT(apiKey);
      await ftClient.user({ id: "me" });
      if (ftClient.lastCode === 401)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API Key is invalid, provide a valid one.",
        });

      const dbData = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, userId));
      if (dbData.length === 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "No entry found for you in DB",
        });

      if (dbData[0]?.disabled) {
        if (!dbData[0]?.userId) {
          await pg
            .update(users)
            .set({
              apiKey,
              userId,
              disabled: false,
            })
            .where(eq(users.userId, userId));
        } else {
          await pg
            .update(users)
            .set({
              apiKey,
              disabled: false,
            })
            .where(eq(users.userId, userId));
        }
      } else {
        if (!dbData[0]?.userId) {
          await pg
            .update(users)
            .set({
              apiKey,
              userId,
            })
            .where(eq(users.userId, userId));
        } else {
          await pg
            .update(users)
            .set({
              apiKey,
            })
            .where(eq(users.userId, userId));
        }
      }

      if (!clients[apiKey]) {
        clients[apiKey] = ftClient;
      }

      return await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "API key has been updated",
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
