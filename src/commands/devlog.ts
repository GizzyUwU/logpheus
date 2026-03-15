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
  params: "[devlogId]",
  desc: "Read a devlog's content!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, clients, prefix }: RequestHandler,
  ) => {
    const devlogIdRaw = command.text.trim();
    const devlogId = Number(devlogIdRaw);

    if (!devlogIdRaw || !Number.isInteger(devlogId) || devlogId <= 0)
      return respond({
        text: "Devlog ID must be a positive whole number.",
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

    const devlog = await ftClient.devlog({
      id: devlogId,
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
              text: `> ${devlog.data.body}`,
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
  },
};
