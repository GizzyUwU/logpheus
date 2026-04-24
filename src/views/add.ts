import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { users } from "../schema/users";
import { projects } from "../schema/projects";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import checkAPIKey from "../lib/apiKeyCheck";
import { getGenericErrorMessage } from "../lib/genericError";
type UserRow = typeof users._.inferSelect;

export default {
  name: "add",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, prefix }: RequestHandler,
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

      const userData = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, userId));

      const checkKey = String(userData[0]?.apiKey);

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

      const working = await checkAPIKey({
        db: pg,
        apiKey: checkKey,
        logger,
      });
      if (!working.works)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Flavortown API Key is invalid, provide a valid one.",
        });

      const apiKey = checkKey!;
      const ftClient = new FT(apiKey, logger);

      if (working.row!.length === 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Unexpected error has occured",
        });

      const updateFields: Partial<UserRow> = {};
      const row = working.row![0];
      if (row?.channel && row?.channel !== channelId)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "This API key is already bound to a different channel",
        });

      const projectsArr = Array.isArray(row?.projects)
        ? Array.from(
            new Set(
              row.projects.filter(
                (p): p is number => Number.isInteger(p) && p > 0,
              ),
            ),
          )
        : [];

      if (projectsArr.includes(numericProjectId)) {
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Project already registered",
        });
      }

      projectsArr.push(numericProjectId);

      if (!row?.userId) {
        updateFields.userId = userId;
      }

      if (!row?.channel) {
        updateFields.channel = channelId;
      }

      updateFields.projects = projectsArr;
      await pg.update(users).set(updateFields).where(eq(users.userId, userId));

      const freshProject = await ftClient.project({ id: numericProjectId });
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
          id: numericProjectId,
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
              text: `:woah-dino: <https://flavortown.hackclub.com/projects/${numericProjectId}|${freshProject.data.title}'s> devlogs just got subscribed to the channel. :yay:`,
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
