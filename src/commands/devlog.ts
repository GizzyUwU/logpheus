import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import checkAPIKey from "../lib/apiKeyCheck";
import { getGenericErrorMessage } from "../lib/genericError";
import {
  containsMarkdown,
  parseMarkdownToSlackBlocks,
} from "../lib/parseMarkdown";
const utcFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

export default {
  name: "devlog",
  params: "[devlogId || latest [projectId]",
  desc: "Read a devlog's content!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, clients, prefix }: RequestHandler,
  ) => {
    const cleanText = command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    const [actionOrId, id] = cleanText.split(" ").filter(Boolean);
    if (!actionOrId)
      return respond({
        text: "'Latest [projectId]' or Devlog Id needs to be provided",
        response_type: "ephemeral",
      });
      

    if (
      actionOrId.toLowerCase() !== "latest" &&
      !Number.isInteger(Number(actionOrId))
    )
      return respond({
        text: "Devlog ID needs to be positive whole number",
        response_type: "ephemeral",
      });

    const userData = await pg
      .select()
      .from(users)
      .where(eq(users.userId, command.user_id))
      .limit(1);

    if (userData.length === 0)
      return respond({
        text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${prefix}-register`,
        response_type: "ephemeral",
      });

    const checkKey = userData[0]?.apiKey;

    const working = await checkAPIKey({
      db: pg,
      apiKey: checkKey,
      logger,
    });

    if (!working.works)
      return respond({
        text: `Hey! Your api key is currently failing the test to see if it works, run /${prefix}-config to re-enter your api key to fix it.`,
        response_type: "ephemeral",
      });
    const apiKey = checkKey!;

    let ftClient: FT = clients[apiKey]!;
    if (!ftClient) {
      ftClient = new FT(apiKey, logger);
    }

    if (actionOrId.toLowerCase() !== "latest") {
      const devlog = await ftClient.devlog({
        id: Number(actionOrId),
      });

      if (!devlog || !devlog.status) {
        return respond({
          text: "Unexpected error has occurred.",
          response_type: "ephemeral",
        });
      }

      if (!devlog.ok || !Object.keys(devlog.data)?.length) {
        switch (devlog.status) {
          case 404:
            return respond({
              text: "Project doesn't exist.",
              response_type: "ephemeral",
            });
          default:
            const msg = getGenericErrorMessage(devlog.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occurred!",
              response_type: "ephemeral",
            });
        }
      }

      const createdAt = devlog.data.created_at
        ? new Date(devlog.data.created_at)
        : new Date();
      const seconds = devlog.data.duration_seconds;
      const pad = (n: number) => n.toString().padStart(2, "0");
      const year = createdAt.getUTCFullYear();
      const month = pad(createdAt.getUTCMonth() + 1);
      const day = pad(createdAt.getUTCDate());
      const hours = pad(createdAt.getUTCHours());
      const minutes = pad(createdAt.getUTCMinutes());
      const cs50Timestamp = `${year}${month}${day}T${hours}${minutes}+0000`;
      const timestamp = utcFormatter.format(createdAt);

      const durationString = ([86400, 3600, 60] as const)
        .map((sec, i) => {
          const val =
            Math.floor((seconds || 0) / sec) %
            (i === 0 ? Infinity : i === 1 ? 24 : 60);
          const labels = ["day", "hour", "minute"];
          return val > 0 ? `${val} ${labels[i]}${val > 1 ? "s" : ""}` : null;
        })
        .filter(Boolean)
        .join(" ");

      type Block =
        | { type: "image"; image_url: string; alt_text: string }
        | {
            type: "video";
            video_url: string;
            thumbnail_url: string;
            title: string;
            alt_text: string;
          };

      const mediaBlocks: Block[] = (devlog.data.media || [])
        .map((m, i): Block | null => {
          const url = "https://flavortown.hackclub.com" + m.url;
          const alt = String(i + 1);

          if (m.content_type && m.content_type.startsWith("video")) {
            return {
              type: "video",
              video_url: url,
              alt_text: alt,
              title: devlog.data.id + "Video" + " " + i,
              thumbnail_url:
                "https://wallpapers.com/images/hd/total-black-solid-color-deskop-otljrvlhh4rl1zy9.jpg",
            };
          }

          if (m.content_type && m.content_type.startsWith("image")) {
            return { type: "image", image_url: url, alt_text: alt };
          }

          return null;
        })
        .filter((b): b is Block => b !== null);

      if (devlog.data.body && !containsMarkdown(devlog.data.body)) {
        return await respond({
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Devlog ${devlog.data.id}`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: String(devlog.data.body)
                  .split("\n")
                  .map((line: string) => `> ${line}`)
                  .join("\n"),
              },
            },
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}`,
                },
              ],
            },
            ...mediaBlocks,
          ],
          response_type: "ephemeral",
        });
      } else {
        await respond({
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Devlog ${devlog.data.id}`,
              },
            },
            ...(devlog.data.body
              ? parseMarkdownToSlackBlocks(devlog.data.body)
              : []),
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}.`,
                },
              ],
            },
            ...mediaBlocks,
          ],
          response_type: "ephemeral",
        });
      }
    } else {
      if (!id || Number.isInteger(id))
        return respond({
          text: "Project ID needs to be positive whole number",
          response_type: "ephemeral",
        });

      const projectDevlogs = await ftClient.devlogs({
        project_id: Number(id),
      });

      if (!projectDevlogs || !projectDevlogs.status) {
        return respond({
          text: "Unexpected error has occurred.",
          response_type: "ephemeral",
        });
      }

      if (
        !projectDevlogs.ok ||
        !Object.keys(projectDevlogs.data)?.length ||
        !projectDevlogs.data.devlogs ||
        projectDevlogs.data.devlogs.length === 0
      ) {
        switch (projectDevlogs.status) {
          default:
            const msg = getGenericErrorMessage(projectDevlogs.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occured!",
              response_type: "ephemeral",
            });
        }
      }

      const devlog = projectDevlogs.data.devlogs.reduce((max, current) => {
        return Number(current.id) > Number(max.id) ? current : max;
      });

      const createdAt = devlog.created_at
        ? new Date(devlog.created_at)
        : new Date();
      const seconds = devlog.duration_seconds;
      const pad = (n: number) => n.toString().padStart(2, "0");
      const year = createdAt.getUTCFullYear();
      const month = pad(createdAt.getUTCMonth() + 1);
      const day = pad(createdAt.getUTCDate());
      const hours = pad(createdAt.getUTCHours());
      const minutes = pad(createdAt.getUTCMinutes());
      const cs50Timestamp = `${year}${month}${day}T${hours}${minutes}+0000`;
      const timestamp = utcFormatter.format(createdAt);

      const durationString = ([86400, 3600, 60] as const)
        .map((sec, i) => {
          const val =
            Math.floor((seconds || 0) / sec) %
            (i === 0 ? Infinity : i === 1 ? 24 : 60);
          const labels = ["day", "hour", "minute"];
          return val > 0 ? `${val} ${labels[i]}${val > 1 ? "s" : ""}` : null;
        })
        .filter(Boolean)
        .join(" ");

      type Block =
        | { type: "image"; image_url: string; alt_text: string }
        | {
            type: "video";
            video_url: string;
            thumbnail_url: string;
            title: string;
            alt_text: string;
          };

      const mediaBlocks: Block[] = (devlog.media || [])
        .map((m, i): Block | null => {
          const url = "https://flavortown.hackclub.com" + m.url;
          const alt = String(i + 1);

          if (m.content_type && m.content_type.startsWith("video")) {
            return {
              type: "video",
              video_url: url,
              alt_text: alt,
              title: devlog.id + "Video" + " " + i,
              thumbnail_url:
                "https://wallpapers.com/images/hd/total-black-solid-color-deskop-otljrvlhh4rl1zy9.jpg",
            };
          }

          if (m.content_type && m.content_type.startsWith("image")) {
            return { type: "image", image_url: url, alt_text: alt };
          }

          return null;
        })
        .filter((b): b is Block => b !== null);

      if (devlog.body && !containsMarkdown(devlog.body)) {
        return await respond({
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Devlog ${devlog.id}`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: String(devlog.body)
                  .split("\n")
                  .map((line: string) => `> ${line}`)
                  .join("\n"),
              },
            },
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}`,
                },
              ],
            },
            ...mediaBlocks,
          ],
          response_type: "ephemeral",
        });
      } else {
        await respond({
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `Devlog ${devlog.id}`,
              },
            },
            ...(devlog.body ? parseMarkdownToSlackBlocks(devlog.body) : []),
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}.`,
                },
              ],
            },
            ...mediaBlocks,
          ],
          response_type: "ephemeral",
        });
      }
    }
  },
};
