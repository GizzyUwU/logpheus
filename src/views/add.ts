import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { users } from "../schema/users";
import { projects } from "../schema/projects";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import checkAPIKey from "../lib/apiKeyCheck";

export default {
  name: "add",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, clients, prefix }: RequestHandler,
  ): Promise<void | ChatPostEphemeralResponse> => {
    try {
      const channelId = JSON.parse(view.private_metadata).channel;
      const userId = body.user.id;
      if (!channelId || !userId) {
        if (!channelId) {
          logger.error("There is no channel id for this channel?");
        } else {
          logger.error("There is no user id for this user?");
        }
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "An unexpected error occurred!",
        });
      }

      const values = view.state.values;
      const projectIdRaw = values["projId"]?.["proj_input"]?.value?.trim();
      const numericProjectId = Number(projectIdRaw);
      let apiKey: string;

      const userData = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, userId));

      if (userData.length === 0) {
        apiKey = String(values["ftApiKey"]?.["api_input"]?.value?.trim());
      } else {
        apiKey = String(userData[0]?.apiKey);
      }

      if (!projectIdRaw)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Project ID is required",
        });
      if (!Number.isInteger(numericProjectId) || numericProjectId <= 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Project ID must be a positive whole number",
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
      const working = await checkAPIKey({
        db: pg,
        apiKey,
        logger,
      });
      if (!working)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API Key is invalid, provide a valid one.",
        });

      const ftClient = new FT(apiKey, logger);

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
              new Set(
                row.projects.filter(
                  (p): p is number => Number.isInteger(p) && p > 0,
                ),
              ),
            )
          : [];

        if (projects.includes(numericProjectId)) {
          return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "Project already registered",
          });
        }

        projects.push(numericProjectId);

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
          projects: [numericProjectId],
        });
      }

      const freshProject = await ftClient.project({ id: numericProjectId });
      if (
        !freshProject ||
        !freshProject.status ||
        (freshProject.ok && !freshProject.data)
      )
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text:
            "No project exists at this id! Last code:" +
            " " +
            ftClient.lastCode,
        });
      else if (!freshProject.ok)
        return client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `Unexpected error has occurred.`,
        });

      if (!freshProject || !freshProject.status) {
        return client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Unexpected error has occurred.",
        });
      }

      if (!freshProject.ok || !Object.keys(freshProject.data)?.length) {
        switch (freshProject.status) {
          case 404:
            return client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: "Project doesn't exist.",
            });
          case 401:
            return client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: "Bad API Key! Run /" + prefix + "-config to fix!",
            });
          default:
            return client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: "Unexpected error!",
            });
        }
      }

      const devlogIds = Array.isArray(freshProject.data.devlog_ids)
        ? freshProject.data.devlog_ids
        : [];

      await pg
        .insert(projects)
        .values({
          id: numericProjectId,
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
              text: `:woah-dino: <https://flavortown.hackclub.com/projects/${numericProjectId}|${freshProject.data.title}'s> devlogs just got subscribed to the channel. :yay:`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `> ${freshProject.data.description}`,
            },
          },
        ],
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
