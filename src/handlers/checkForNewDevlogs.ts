import type { RichTextBlock, WebClient } from "@slack/web-api";
import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { users } from "../schema/users";
import { projects } from "../schema/projects";
import { eq } from "drizzle-orm";
import { containsMarkdown } from "../lib/parseMarkdown";
import { parseMarkdownToSlackBlocks } from "../lib/parseMarkdown";
import type { logger as LogtapeLogger, RequestHandler } from "..";
import FT from "../lib/ft";
import { z } from "zod";
import type { GetDevlogParams, GetDevlogResponse } from "../lib/ft.zod";
type DB =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

async function getNewDevlogs(
  apiKey: string,
  projectId: number,
  app: WebClient,
  clients: Record<string, FT>,
  db: DB,
  prefix: string,
  logger: typeof LogtapeLogger,
): Promise<{
  name: string;
  devlogs: z.infer<typeof GetDevlogResponse>[];
  shipped?: "pending" | "submitted";
} | void> {
  try {
    let client = clients[apiKey];
    if (!client) {
      const ctx = logger.with({
        project: {
          id: projectId,
        },
      });
      ctx.error("No FT Client for the project");
      return;
    }

    let project = await client.project({ id: Number(projectId) });

    if (!project || !project.status) {
      const row = await db
        .select()
        .from(users)
        .where(eq(users.apiKey, apiKey))
        .limit(1);
      const ctx = logger.with({
        project,
        user: row[0],
      });
      ctx.error("Unexpected project response");
      return;
    }

    if (!project.ok && project.status === 408) return;
    if (!project.ok && project.status === 429) {
      while (project.status === 429) {
        const waitMs = 2000 + Math.floor(Math.random() * 1000);
        await new Promise((res) => setTimeout(res, waitMs));
        project = await client.project({ id: Number(projectId) });
      }
    }

    if (!Object.keys(project).length || !project.ok || !project.data) {
      const row = await db
        .select()
        .from(users)
        .where(eq(users.apiKey, apiKey))
        .limit(1);

      const disabled = row[0]?.disabled;
      if (disabled !== true) {
        if (project.status === 401) {
          delete clients[apiKey];
          await db
            .update(users)
            .set({
              disabled: true,
            })
            .where(eq(users.apiKey, apiKey));

          if (!row[0]?.channel) return;
          await app.chat.postMessage({
            channel: row[0]?.channel,
            text: `Hey! You're project has been disabled from devlog tracking because of the api key returning 401! Setup the API Key again in /${prefix}-config to get it re-enabled.`,
          });
        } else if (project.status === 404) {
          const ctx = logger.with({
            project: {
              id: projectId,
            },
          });
          ctx.error("No project exists at id");
        } else if (
          project.status &&
          project.status >= 500 &&
          project.status < 600
        ) {
          return;
        } else {
          const ctx = logger.with({
            project: {
              id: projectId,
            },
          });
          ctx.error(client.lastCode + " " + "Failed to get project");
        }
      }

      return;
    }

    const devlogIds = Array.isArray(project?.data.devlog_ids)
      ? project.data.devlog_ids
      : [];

    const row = await db
      .select()
      .from(projects)
      .where(eq(projects.id, Number(projectId)));

    if (row.length === 0) {
      const initialDevlogIds = Array.isArray(project?.data.devlog_ids)
        ? project.data.devlog_ids.map(Number)
        : [];

      await db.insert(projects).values({
        id: Number(projectId),
        devlogIds: initialDevlogIds,
      });

      return {
        name: project.data.title ?? "Unknown",
        devlogs: [],
      };
    }

    let cachedIds: number[] = [];

    if (row.length > 0) {
      try {
        cachedIds = row[0]!.devlogIds.map(Number);
      } catch {
        cachedIds = [];
      }
    }

    const cachedSet = new Set(cachedIds);
    const newIds = devlogIds.filter((id) => !cachedSet.has(Number(id)));

    if (newIds.length === 0) {
      return { name: project.data.title ?? "Unknown", devlogs: [] };
    } else {
      const devlogs: z.infer<typeof GetDevlogResponse>[] = [];
      for (const id of newIds) {
        const res = await client.devlog({
          id,
        } as z.infer<typeof GetDevlogParams>);
        if (res && res.ok) devlogs.push(res.data || []);
      }

      if (devlogs.length === 0) {
        const ctx = logger.with({
          project: {
            id: projectId,
          },
        });
        ctx.error(
          "There was a new id but yet devlogs array stayed empty this could indicate a bug.",
        );
        return { name: project.data.title ?? "Unknown", devlogs: [] };
      }

      await db
        .update(projects)
        .set({
          devlogIds: Array.from(new Set([...cachedIds, ...newIds])),
        })
        .where(eq(projects.id, Number(projectId)));

      return { name: project.data.title ?? "Unknown", devlogs };
    }
  } catch (err) {
    const ctx = logger.with({
      project: {
        id: projectId,
      },
      location: "getNewDevlogs,topLevelTryCatch",
    });
    ctx.error({ error: err });
    return;
  }
}

export default {
  name: "checkForNewDevlogs",
  execute: async ({ client, clients, prefix, pg, logger }: RequestHandler) => {
    try {
      const userRows = await pg.select().from(users);
      if (!userRows?.length) return;
      for (const row of userRows) {
        if (
          !row ||
          !row.apiKey ||
          !row.channel ||
          !row.projects ||
          row.disabled
        )
          continue;
        if (!clients[row.apiKey])
          clients[row.apiKey] = new FT(row.apiKey, logger);
        const projects = Array.isArray(row.projects)
          ? row.projects.map(Number)
          : [];
        for (const projectId of projects) {
          const projData = await getNewDevlogs(
            row.apiKey,
            projectId,
            client,
            clients,
            pg,
            String(prefix),
            logger,
          );
          if (!projData) continue;
          if (projData.devlogs.length > 0) {
            for (const devlog of projData.devlogs) {
              try {
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
                const timestamp = createdAt.toLocaleString("en-GB", {
                  dateStyle: "short",
                  timeStyle: "short",
                  timeZone: "UTC",
                });

                const durationString = ([86400, 3600, 60] as const)
                  .map((sec, i) => {
                    const val =
                      Math.floor((seconds || 0) / sec) %
                      (i === 0 ? Infinity : i === 1 ? 24 : 60);
                    const labels = ["day", "hour", "minute"];
                    return val > 0
                      ? `${val} ${labels[i]}${val > 1 ? "s" : ""}`
                      : null;
                  })
                  .filter(Boolean)
                  .join(" ");

                type Block =
                  | { type: "image"; image_url: string; alt_text: string }
                  | { type: "video"; video_url: string; alt_text: string };

                const mediaBlocks: Block[] = (devlog.media || [])
                  .map((m, i): Block | null => {
                    const url = "https://flavortown.hackclub.com" + m.url;
                    const alt = String(i + 1);

                    if (m.content_type && m.content_type.startsWith("video")) {
                      return { type: "video", video_url: url, alt_text: alt };
                    }

                    if (m.content_type && m.content_type.startsWith("image")) {
                      return { type: "image", image_url: url, alt_text: alt };
                    }

                    return null;
                  })
                  .filter((b): b is Block => b !== null);

                const pingGroupId =
                  row?.meta
                    ?.find((s) => s.startsWith("PingGroup::"))
                    ?.split("::")[1] ?? "";
                try {
                  if (devlog.body && !containsMarkdown(devlog.body)) {
                    await client.chat.postMessage({
                      channel: row.channel,
                      unfurl_links: true,
                      unfurl_media: true,
                      blocks: [
                        {
                          type: "section",
                          text: {
                            type: "mrkdwn",
                            text: `:shipitparrot: <https://flavortown.hackclub.com/projects/${projectId}|${projData.name}> got a new devlog posted! :shipitparrot:`,
                          },
                        },
                        {
                          type: "section",
                          text: {
                            type: "mrkdwn",
                            text: `> ${devlog.body}`,
                          },
                        },
                        ...(pingGroupId
                          ? [
                              {
                                type: "rich_text",
                                elements: [
                                  {
                                    type: "rich_text_section",
                                    elements: [
                                      {
                                        type: "usergroup",
                                        usergroup_id: "S0AKABM82UF",
                                      },
                                    ],
                                  },
                                ],
                              } as RichTextBlock,
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
                              text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}`,
                            },
                          ],
                        },
                        ...mediaBlocks,
                      ],
                    });
                  } else {
                    await client.chat.postMessage({
                      channel: row.channel,
                      unfurl_links: false,
                      unfurl_media: false,
                      blocks: [
                        {
                          type: "section",
                          text: {
                            type: "mrkdwn",
                            text: `:shipitparrot: <https://flavortown.hackclub.com/projects/${projectId}|${projData.name}> got a new devlog posted! :shipitparrot:`,
                          },
                        },
                        ...(devlog.body
                          ? parseMarkdownToSlackBlocks(devlog.body)
                          : []),
                        ...(pingGroupId
                          ? [
                              {
                                type: "rich_text",
                                elements: [
                                  {
                                    type: "rich_text_section",
                                    elements: [
                                      {
                                        type: "usergroup",
                                        usergroup_id: "S0AKABM82UF",
                                      },
                                    ],
                                  },
                                ],
                              } as RichTextBlock,
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
                              text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}.`,
                            },
                          ],
                        },
                        ...mediaBlocks,
                      ],
                    });
                  }
                } catch (err) {
                  if (typeof err === "object" && err !== null) {
                    const error = err as {
                      code?: string;
                      data?: {
                        error: string;
                      };
                    };
                    if (
                      error?.code === "slack_webapi_platform_error" &&
                      error.data?.error === "channel_not_found"
                    ) {
                      if (!row.userId) return;
                      delete clients[row.apiKey];
                      await pg
                        .update(users)
                        .set({
                          disabled: true,
                        })
                        .where(eq(users.userId, row.userId));
                      await client.chat.postMessage({
                        channel: row.userId,
                        text: `Hey! The automated devlog poster has been disabled for you because I am not in the channel where it's meant to be sent in. Add me to the channel and run /${prefix}-reactivate to get it enabled.`,
                      });
                      return;
                    }
                  }

                  const ctx = logger.with({
                    error: err,
                  });

                  ctx.error(
                    "Unexpected error occured when trying to post the automated message.",
                  );
                }
              } catch (err) {
                const ctx = logger.with({
                  project: {
                    id: projectId,
                  },
                });
                ctx.error({ error: err });
              }
            }
          }

          await new Promise((res) => setTimeout(res, 2000));
          continue;
        }
      }
    } catch (err) {
      const ctx = logger.with({
        location: "checkForNewDevlogs,topLevelTryCatch",
      });
      ctx.error({
        error: err,
      });
    }
  },
};
