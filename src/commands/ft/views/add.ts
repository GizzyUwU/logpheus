import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import FT from "@/lib/ft";
import { users } from "@/schema/users";
import { projects } from "@/schema/projects";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import checkAPIKey from "@/lib/ft/apiKeyCheck";
import { getGenericErrorMessage } from "@/lib/genericError";
type UserRow = typeof users._.inferSelect;

export default {
  name: "add",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, prefix, yswsData, folder }: RequestHandler,
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

      if (yswsData && Object.keys(yswsData).length === 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
        });

      const values = view.state.values;
      const projectId = Number(values["projId"]?.["proj_input"]?.value?.trim());
      const apiKey = String(yswsData?.apiKey);
      
      if (!projectId || Number.isInteger(projectId) || projectId <= 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Project ID must be a positive whole number",
        });

      const working = await checkAPIKey({
        db: pg,
        apiKey,
        logger,
      });
      if (!working.works)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API Key is invalid, provide a valid one.",
        });

      const ftClient = new FT(apiKey, logger);
      const updateFields: Partial<UserRow> = {};
      const projectsArr = Array.isArray(yswsData?.projects)
        ? Array.from(
            new Set(
              yswsData.projects.filter(
                (p): p is number => Number.isInteger(p) && p > 0,
              ),
            ),
          )
        : [];

      if (projectsArr.includes(projectId)) {
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Project ID already registered to your account!",
        });
      }

      projectsArr.push(projectId);

      updateFields.projects = projectsArr;
      await pg.update(users).set(updateFields).where(eq(users.userId, userId));

      const freshProject = await ftClient.project({ id: projectId });
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
          default:
            const msg = getGenericErrorMessage(freshProject.status, prefix!);
            return client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: msg ?? "Unexpected error has occured!",
            });
        }
      }

      const devlogIds = Array.isArray(freshProject.data.devlog_ids)
        ? freshProject.data.devlog_ids
        : [];

      await pg
        .insert(projects)
        .values({
          id: projectId,
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
              text: `:woah-dino: <https://flavortown.hackclub.com/projects/${projectId}|${freshProject.data.title}'s> devlogs just got subscribed to the channel. :yay:`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: String(freshProject.data.description)
                .split("\n")
                .map((line: string) => `> ${line}`)
                .join("\n"),
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
