import type {
  SlackViewMiddlewareArgs,
} from "@slack/bolt";
import { eq } from "drizzle-orm";
import FT from "../lib/ft";
import { users } from "../schema/users";
import type { RequestHandler } from "..";

export default {
  name: "config",
  execute: async (
    { view }: SlackViewMiddlewareArgs,
    { pg, client, clients, sentryEnabled, Sentry }: RequestHandler,
  ) => {
    const userIdBlock = view.blocks.find(
      (block): block is { type: "section"; text: { text: string } } =>
        block.type === "section" && "text" in block,
    );
    const userId = userIdBlock?.text?.text.slice("User: ".length);
    const channelId = view.title.text;
    if (!channelId || !userId) {
      if (sentryEnabled) {
        Sentry.setContext("view", { ...view });
        Sentry.captureMessage("There is no channel id for this channel?");
      } else {
        console.error("There is no channel id?", view);
      }
      return;
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

    const dbData = await pg
      .select()
      .from(users)
      .limit(1)
      .where(eq(users.channel, channelId));
    if (dbData.length === 0)
      return await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "No entry found for this channel ID",
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
          .where(eq(users.channel, channelId));
      } else {
        await pg
          .update(users)
          .set({
            apiKey,
            disabled: false,
          })
          .where(eq(users.channel, channelId));
      }
    } else {
      if (!dbData[0]?.userId) {
        await pg
          .update(users)
          .set({
            apiKey,
            userId,
          })
          .where(eq(users.channel, channelId));
      } else {
        await pg
          .update(users)
          .set({
            apiKey,
          })
          .where(eq(users.channel, channelId));
      }
    }

    if(!clients[apiKey]) {
      clients[apiKey] = ftClient
    }
    
    return await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: "API key has been updated",
    });
  },
};
