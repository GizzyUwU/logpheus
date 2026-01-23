import type {
  AckFn,
  ViewOutput,
  RespondArguments,
  RespondFn,
} from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import FT from "../lib/ft";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import { apiKeys } from "../schema/apiKeys";
import { eq } from "drizzle-orm";
import { projectData } from "../schema/project";

export default {
  name: "logpheus_add",
  execute: async (
    {
      ack,
      view,
      client,
    }: {
      ack: AckFn<string | RespondArguments>;
      view: ViewOutput;
      client: WebClient;
    },
    {
      pg,
    }: {
      pg: PgliteDatabase<Record<string, never>> & {
        $client: PGlite;
      };
    },
  ) => {
    const userIdBlock = view.blocks.find(
      (block): block is { type: "section"; text: { text: string } } =>
        block.type === "section" && "text" in block,
    );
    const userId = userIdBlock?.text?.text.slice("User: ".length);
    const channelId = view.title.text;
    if (!channelId || !userId) return console.log("No channel id or user id");
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
      .from(apiKeys)
      .where(eq(apiKeys.apiKey, apiKey));
    if (exists.length > 0) {
      const row = exists[0];
      if (exists[0]?.channel !== channelId)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "This API key is already bound to a different channel",
        });
      const normalizedProjectId = String(Number(projectId));

      const projects = Array.isArray(row?.projects)
        ? Array.from(
            new Set(row.projects.map((p) => String(Number(p))).filter(Boolean)),
          )
        : [];

      if (projects.includes(normalizedProjectId)) {
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Project already registered",
        });
      }

      projects.push(normalizedProjectId);

      projects.push(projectId);
      console.log("aaaaaaa");
      await pg
        .update(apiKeys)
        .set({ projects })
        .where(eq(apiKeys.apiKey, apiKey));
    } else {
      await pg.insert(apiKeys).values({
        apiKey,
        channel: channelId,
        projects: [projectId],
      });
    }

    const freshProject = await ftClient.project({ id: Number(projectId) });
    if (!freshProject) return;

    const ids = Array.isArray(freshProject.devlog_ids)
      ? freshProject.devlog_ids
      : [];
    const shipStatus =
      typeof freshProject.ship_status === "string"
        ? freshProject.ship_status
        : null;
    await pg
      .insert(projectData)
      .values({
        projectId: Number(projectId),
        ids,
        shipStatus,
      })
      .onConflictDoUpdate({
        target: projectData.projectId,
        set: {
          ids,
          shipStatus,
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
