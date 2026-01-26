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
  name: "add",
  execute: async (
    { view }: SlackViewMiddlewareArgs,
    { pg, client, sentryEnabled, Sentry }: RequestHandler,
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
    const projectId = values.projId?.proj_input?.value?.trim();
    const apiKey = values.ftApiKey?.api_input?.value?.trim();
    if (!projectId)
      return await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "Project ID is required",
      });
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
    if (exists.length > 0) {
      const row = exists[0];
      if (row?.channel && row?.channel !== channelId)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "This API key is already bound to a different channel",
        });

      const projects = Array.isArray(row?.projects)
        ? Array.from(
            new Set(row.projects.map((p) => Number(p)).filter(Boolean)),
          )
        : [];

      if (projects.includes(Number(projectId))) {
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Project already registered",
        });
      }

      projects.push(Number(projectId));

      if (!row?.userId) {
        await pg
          .update(users)
          .set({ projects, userId })
          .where(eq(users.apiKey, apiKey));
      } else if (!row?.channel && !row?.userId) {
        await pg
          .update(users)
          .set({ projects, userId, channel: channelId })
          .where(eq(users.apiKey, apiKey));
      } else {
        await pg
          .update(users)
          .set({ projects })
          .where(eq(users.apiKey, apiKey));
      }
    } else {
      await pg.insert(users).values({
        apiKey,
        userId: userId,
        channel: channelId,
        disabled: false,
        projects: [Number(projectId)],
      });
    }

    const freshProject = await ftClient.project({ id: Number(projectId) });
    if (!freshProject) return;

    const devlogIds = Array.isArray(freshProject.devlog_ids)
      ? freshProject.devlog_ids
      : [];

    await pg
      .insert(projects)
      .values({
        id: Number(projectId),
        devlogIds,
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          devlogIds,
        },
      });

    await client.chat.postMessage({
      channel: channelId,
      unfurl_links: false,
      unfurl_media: false,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:woah-dino: <https://flavortown.hackclub.com/projects/${projectId}|${freshProject.title}'s> devlogs just got subscribed to the channel. :yay:`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `> ${freshProject.description}`,
          },
        },
      ],
    });
  },
};
