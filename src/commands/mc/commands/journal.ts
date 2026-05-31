import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import ysws from "@/ysws";
import { getGenericErrorMessage } from "@/lib/genericError";
import {
  containsMarkdown,
  parseMarkdownToSlackBlocks,
} from "@/lib/parseMarkdown";
import type Macondo from "@/lib/macondo";
import { macondoContentTypeFromUrl } from "@/lib/adapters/macondo/adapter";
const utcFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

export default {
  name: "journal",
  params: "[projectId] [journalId] || latest [projectId]",
  desc: "Read a devlog's content!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { yswsClient, prefix, folder, yswsData }: RequestHandler,
  ) => {
    const cleanText = command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    const [actionOrProjId, id] = cleanText.split(" ").filter(Boolean);
    if (!actionOrProjId || !id)
      return respond({
        text: "'latest [projectId]' or '[projectId] [journalId]' needs to be provided",
        response_type: "ephemeral",
      });

    // if (userData && Object.keys(userData).length === 0)
    //   return respond({
    //     text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${prefix} register`,
    //     response_type: "ephemeral",
    //   });

    if (yswsData && Object.keys(yswsData).length === 0)
      return respond({
        text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
        response_type: "ephemeral",
      });

    if (!yswsClient)
      return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

    const mcClient: Macondo = yswsClient.raw as Macondo;

    const MD_IMAGE_RE = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    if (actionOrProjId.toLowerCase() === "latest") {
      const journals = await mcClient.journals({
        id: Number(id),
      });

      if (!journals || !journals.status)
        return respond({
          text: "Unexpected error has occurred.",
          response_type: "ephemeral",
        });

      if (!journals.ok) {
        switch (journals.status) {
          case 404:
            return respond({
              text: "Project doesn't exist.",
              response_type: "ephemeral",
            });
          default:
            const msg = getGenericErrorMessage(journals.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occurred!",
              response_type: "ephemeral",
            });
        }
      }

      if (!Object.keys(journals.data)?.length)
        return respond({
          text: "No journals found.",
          response_type: "ephemeral",
        });

      const latestJournal =
        journals?.data.length === 0
          ? null
          : journals?.data.reduce((latest, journal) =>
              journal.id > latest.id ? journal : latest,
            );

      if (!latestJournal)
        return respond({
          text: "No journals found.",
          response_type: "ephemeral",
        });

      const createdAt = latestJournal.created_at
        ? new Date(latestJournal.created_at)
        : new Date();
      const seconds = latestJournal.hours;
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

      const raw = latestJournal.long_brief ?? latestJournal.short_brief ?? "";
      const mediaUrls = [...raw.matchAll(MD_IMAGE_RE)]
        .map((m) => m[1])
        .filter((url): url is string => !!url);
      const body = raw.replace(MD_IMAGE_RE, "").trim() || null;

      const media = mediaUrls.map((url) => ({
        url,
        content_type: macondoContentTypeFromUrl(url),
      }));

      const mediaBlocks: Block[] = (media || [])
        .map((m, i): Block | null => {
          const url = m.url?.includes("https")
            ? m.url
            : ysws.macondo.mediaUrl + m.url;
          const alt = String(i + 1);

          if (m.content_type && m.content_type.startsWith("image")) {
            return { type: "image", image_url: url, alt_text: alt };
          }

          return null;
        })
        .filter((b): b is Block => b !== null);

      const videoLinks = (media || [])
        .filter((m) => m.content_type && m.content_type.startsWith("video"))
        .map(
          (m, i) =>
            `<${m.url?.includes("https") ? m.url : ysws.macondo.mediaUrl + m.url}|Video ${i + 1}>`,
        );

      if (body && !containsMarkdown(body)) {
        return await respond({
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `Journal #${latestJournal.id}`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: String(body)
                  .split("\n")
                  .map((line: string) => `> ${line}`)
                  .join("\n"),
              },
            },
            ...(videoLinks.length > 0
              ? [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `> Video Devlog Links: ${videoLinks.join(", ")}`,
                    },
                  } as {
                    type: "section";
                    text: {
                      type: "mrkdwn";
                      text: string;
                    };
                  },
                ]
              : []),
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> ${seconds !== 0 ? `and took ${durationString}.` : ""}}`,
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
              type: "header",
              text: {
                type: "plain_text",
                text: `Journal #${latestJournal.id}`,
              },
            },
            ...(body ? parseMarkdownToSlackBlocks(body) : []),
            ...(videoLinks.length > 0
              ? [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `> Video Devlog Links: ${videoLinks.join(", ")}`,
                    },
                  } as {
                    type: "section";
                    text: {
                      type: "mrkdwn";
                      text: string;
                    };
                  },
                ]
              : []),
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> ${seconds !== 0 ? `and took ${durationString}.` : ""}`,
                },
              ],
            },
            ...mediaBlocks,
          ],
          response_type: "ephemeral",
        });
      }
    } else {
      if (!Number.isInteger(Number(actionOrProjId)))
        return respond({
          text: "Project ID needs to be positive whole number",
          response_type: "ephemeral",
        });
      if (!Number.isInteger(Number(id)))
        return respond({
          text: "Journal ID needs to be positive whole number",
          response_type: "ephemeral",
        });

      const journal = await mcClient.journal({
        projectId: Number(actionOrProjId),
        journalId: Number(id),
      });

      if (!journal || !journal.status) {
        return respond({
          text: "Unexpected error has occurred.",
          response_type: "ephemeral",
        });
      }

      if (!journal.ok || !Object.keys(journal.data)?.length) {
        switch (journal.status) {
          default:
            const msg = getGenericErrorMessage(journal.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occured!",
              response_type: "ephemeral",
            });
        }
      }

      const createdAt = journal.data.created_at
        ? new Date(journal.data.created_at)
        : new Date();
      const seconds = journal.data.hours;
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

      const raw = journal.data.long_brief ?? journal.data.short_brief ?? "";
      const mediaUrls = [...raw.matchAll(MD_IMAGE_RE)]
        .map((m) => m[1])
        .filter((url): url is string => !!url);
      const body = raw.replace(MD_IMAGE_RE, "").trim() || null;

      const media = mediaUrls.map((url) => ({
        url,
        content_type: macondoContentTypeFromUrl(url),
      }));

      const mediaBlocks: Block[] = (media || [])
        .map((m, i): Block | null => {
          const url = m.url?.includes("https")
            ? m.url
            : ysws.macondo.mediaUrl + m.url;
          const alt = String(i + 1);

          if (m.content_type && m.content_type.startsWith("image")) {
            return { type: "image", image_url: url, alt_text: alt };
          }

          return null;
        })
        .filter((b): b is Block => b !== null);

      const videoLinks = (media || [])
        .filter((m) => m.content_type && m.content_type.startsWith("video"))
        .map(
          (m, i) =>
            `<${m.url?.includes("https") ? m.url : ysws.macondo.mediaUrl + m.url}|Video ${i + 1}>`,
        );

      if (body && !containsMarkdown(body)) {
        return await respond({
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `Journal #${journal.data.id}`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: String(body)
                  .split("\n")
                  .map((line: string) => `> ${line}`)
                  .join("\n"),
              },
            },
            ...(videoLinks.length > 0
              ? [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `> Video Devlog Links: ${videoLinks.join(", ")}`,
                    },
                  } as {
                    type: "section";
                    text: {
                      type: "mrkdwn";
                      text: string;
                    };
                  },
                ]
              : []),
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> ${seconds !== 0 ? `and took ${durationString}.` : ""}`,
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
              type: "header",
              text: {
                type: "plain_text",
                text: `Journal #${journal.data.id}`,
              },
            },
            ...(body ? parseMarkdownToSlackBlocks(body) : []),
            ...(videoLinks.length > 0
              ? [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `> Video Devlog Links: ${videoLinks.join(", ")}`,
                    },
                  } as {
                    type: "section";
                    text: {
                      type: "mrkdwn";
                      text: string;
                    };
                  },
                ]
              : []),
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> ${seconds !== 0 ? `and took ${durationString}.` : ""}`,
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
