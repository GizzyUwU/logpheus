import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { users } from "../schema/users";
import { projects } from "../schema/projects";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";

export default {
  name: "add",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, clients, sentryEnabled, Sentry }: RequestHandler,
  ) => {
    const channelId = JSON.parse(view.private_metadata).channel;
    const userId = body.user.id;
    if (channelId || !userId) {
      if (sentryEnabled) {
        if (channelId) {
          logger.error("There is no channel id for this channel?");
        } else {
          logger.error("There is no user id for this user?");
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
      const projectId = values.projId?.proj_input?.value?.trim();
      let apiKey: string;

      const userData = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, userId));

      if (userData.length === 0) {
        apiKey = String(values.ftApiKey?.api_input?.value?.trim());
      } else {
        apiKey = String(userData[0]?.apiKey);
      }

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
        } else if (!row?.channel) {
          await pg
            .update(users)
            .set({ projects, channel: channelId })
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
      if (!freshProject)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "No project exists at this id! Last code:" + " " + ftClient.lastCode,
        });

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

      if (!clients[apiKey]) {
        clients[apiKey] = ftClient;
      }

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
    } catch (err) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "An unexpected error occurred!",
      });
    }
  },
};
