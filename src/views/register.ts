import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";

export default {
  name: "register",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, client, sentryEnabled, Sentry }: RequestHandler,
  ) => {
    const channelId = JSON.parse(view.private_metadata).channel;

    const userId = body.user.id;

    if (!channelId || !userId) {
      if (sentryEnabled) {
        Sentry.setContext("view", { ...view });
        if (!channelId) {
          Sentry.captureMessage("There is no channel id for this channel?");
        } else {
          Sentry.captureMessage("There is no user id for this user?");
        }
      } else {
        if (!channelId) {
          console.error("There is no channel id?", view);
        } else {
          console.error("There is no user id?", view);
        }
      }
      return await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "An unexpected error occurred!",
      });
    }

    try {
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
      if (apiKey.length !== 46)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API key is invalid every api key should be 46 characters long",
        });
      const ftClient = new FT(apiKey);
      await ftClient.user({ id: "me" });
      if (ftClient.lastCode === 401)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API Key is invalid, provide a valid one.",
        });

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

      await pg.insert(users).values({
        apiKey,
        userId: userId,
        disabled: false,
      });

      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        markdown_text: ":woah-dino: You sucessfully registered! :yay:",
      });
    } catch (err) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "An unexpected error occurred!",
      });
    }
  },
};
