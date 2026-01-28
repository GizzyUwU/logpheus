import type {
  AckFn,
  ViewOutput,
  RespondArguments,
  SlackViewMiddlewareArgs,
} from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import FT from "../lib/ft";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { users } from "../schema/users";
import { projects } from "../schema/projects";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";

export default {
  name: "register",
  execute: async (
    { view }: SlackViewMiddlewareArgs,
    { pg, client, sentryEnabled, Sentry }: RequestHandler,
  ) => {
    const channelBlock = view.blocks.find(
      (block): block is { type: "section"; text: { text: string } } =>
        block.type === "section" && block.block_id === "channel_id",
    );

    const userBlock = view.blocks.find(
      (block): block is { type: "section"; text: { text: string } } =>
        block.type === "section" && block.block_id === "user_id",
    );
    const channelId = channelBlock?.text?.text.slice("Channel: ".length);
    const userId = userBlock?.text?.text.slice("User: ".length);
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
      markdown_text: ":woah-dino: You sucessfully registered! :yay:"
    })
  },
};
