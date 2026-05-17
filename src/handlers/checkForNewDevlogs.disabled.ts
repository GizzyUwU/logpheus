import type { RichTextBlock, WebClient } from "@slack/web-api";
import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { users } from "../schema/users";
import { projects } from "../schema/projects";
import { and, eq, isNull, not } from "drizzle-orm";
import { containsMarkdown } from "../lib/parseMarkdown";
import { parseMarkdownToSlackBlocks } from "../lib/parseMarkdown";
import type { logger as LogtapeLogger, RequestHandler } from "..";
import FT from "../lib/ft";
import { z } from "zod";
import type { GetDevlogResponse } from "../lib/ft.zod";
type DB =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

const utcFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

async function getNewDevlogs(params: {
  apiKey: string;
  projectId: number;
  app: WebClient;
  clients: Record<string, FT>;
  db: DB;
  prefix: string;
  logger: typeof LogtapeLogger;
  userByAPIKey: Map<string, Partial<typeof users.$inferSelect>>;
  projectsMap: Map<number, Partial<typeof projects.$inferSelect>>;
}): Promise<{
  name: string;
  devlogs: z.infer<typeof GetDevlogResponse>[];
  additionCookies?: number;
  nextGoalItem?: string;
  distanceFromGoal?: number;
} | void> {
  try {
    let client = params.clients[params.apiKey];
    if (!client) {
      params.logger.error("No FT Client for the project", {
        project: {
          id: params.projectId,
        },
      });
      return;
    }

    let project = await client.project({ id: Number(params.projectId) });

    if (!project || !project.status) {
      const row = params.userByAPIKey.get(params.apiKey);
      params.logger.error("Unexpected project response", {
        project,
        user: row,
      });
      return;
    }

    if (!project.ok && project.status === 408) return;
    if (!project.ok && project.status === 429) {
      while (project.status === 429) {
        const waitMs = 2000 + Math.floor(Math.random() * 1000);
        await new Promise((res) => setTimeout(res, waitMs));
        project = await client.project({ id: Number(params.projectId) });
      }
    }

    if (!Object.keys(project).length || !project.ok || !project.data) {
      const row = params.userByAPIKey.get(params.apiKey);

      if (project.status === 401) {
        delete params.clients[params.apiKey];
        await params.db
          .update(users)
          .set({
            disabled: true,
          })
          .where(eq(users.apiKey, params.apiKey));

        if (!row?.channel) return;
        await params.app.chat.postMessage({
          channel: row?.channel,
          text: `Hey! You're project has been disabled from devlog tracking because of the api key returning 401! Setup the API Key again in /${params.prefix}-config to get it re-enabled.`,
        });
        return;
      } else if (project.status === 404) {
        delete params.clients[params.apiKey];
        await params.db
          .update(users)
          .set({
            disabled: true,
          })
          .where(eq(users.apiKey, params.apiKey));

        if (!row?.channel) return;
        await params.app.chat.postMessage({
          channel: row?.channel,
          text: `Hey! You got disabled because of ${params.projectId} no longer exist and is 404ing. To get re-enabled run /${params.prefix}-remove ${params.projectId} and then /${params.prefix}-reactivate.`,
        });
        return;
      } else if (
        project.status &&
        project.status >= 500 &&
        project.status < 600
      ) {
        return;
      } else {
        params.logger.error(client.lastCode + " " + "Failed to get project", {
          project: {
            id: params.projectId,
          },
        });
        return;
      }
    }

    const devlogIds = Array.isArray(project?.data.devlog_ids)
      ? project.data.devlog_ids
      : [];

    const row = params.projectsMap.get(params.projectId)
      ? [params.projectsMap.get(params.projectId)!]
      : [];

    if (row.length === 0) {
      const initialDevlogIds = Array.isArray(project?.data.devlog_ids)
        ? project.data.devlog_ids.map(Number)
        : [];

      await params.db
        .insert(projects)
        .values({
          id: Number(params.projectId),
          devlogIds: initialDevlogIds,
        })
        .onConflictDoUpdate({
          target: projects.id,
          set: {
            devlogIds: initialDevlogIds,
          },
        });

      return {
        name: project.data.title ?? "Unknown",
        devlogs: [],
      };
    }

    let cachedIds: number[] = [];

    if (row.length > 0) {
      try {
        cachedIds = row[0]?.devlogIds?.map(Number) ?? [];
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
      const devlogS: number[] = [];
      let page: number | null = 1;
      while (page) {
        const res = await client.devlogs(
          { project_id: Number(params.projectId) },
          { page },
        );
        if (!res || !res.ok) break;
        const data = res.data;
        if (data?.devlogs) {
          for (const log of data.devlogs) {
            devlogS.push(Number(log.duration_seconds));
            if (newIds.includes(Number(log.id))) {
              devlogs.push(log);
            }
          }
        }
        page = data?.pagination?.next_page ?? null;
      }

      const totalSeconds = (devlogS ?? []).reduce((sum, item) => sum + item, 0);
      const predictedCookies = Math.round(
        (row[0]?.multiplier ?? 10) * (totalSeconds / 3600),
      );
      const userRow = params.userByAPIKey.get(params.apiKey);
      const previousPredicted = row[0]?.predictedCookies ?? 0;

      let nextGoalItem = "";
      let distanceFromGoal = 0;
      let additionCookies = 0;

      const meUser = await client.user({ id: "me" });
      if (meUser.ok && Object.keys(meUser.data)?.length) {
        if (previousPredicted) {
          additionCookies = Math.max(0, predictedCookies - previousPredicted);
        }

        const goals =
          userRow?.meta?.find((s) => s.startsWith("Goals::"))?.split("::")[1] ??
          "";
        if (goals.length > 0) {
          const shop = await client.shop();
          if (shop.ok && shop.data?.length) {
            const region =
              userRow?.meta
                ?.find((s) => s.startsWith("Region::"))
                ?.split("::")[1] ?? "";
            const match = goals.match(/\[(.*?)\]/);
            const parsedGoals = match?.[1]
              ? match[1]
                  .split(",")
                  .map((v) => parseInt(v.trim()))
                  .filter((v) => !isNaN(v))
              : [];
            for (const goalId of parsedGoals) {
              const item = shop.data.find((s) => s.id === goalId);
              if (!item) continue;

              const cost =
                region && region.length > 0
                  ? ((item.ticket_cost as Record<string, number | undefined>)[
                      region.toLowerCase()
                    ] ??
                    item.ticket_cost?.base_cost ??
                    0)
                  : (item.ticket_cost?.base_cost ?? 0);

              if (Number(meUser.data.cookies) + predictedCookies < cost) {
                nextGoalItem = String(item.name);
                distanceFromGoal =
                  cost - (Number(meUser.data.cookies) + predictedCookies);
                break;
              }
            }
          }
        }
      }

      if (devlogs.length === 0) {
        params.logger.error(
          "There was a new id but yet devlogs array stayed empty this could indicate a bug.",
          {
            project: {
              id: params.projectId,
            },
          },
        );
        return { name: project.data.title ?? "Unknown", devlogs: [] };
      }

      await params.db
        .update(projects)
        .set({
          devlogIds: Array.from(new Set([...cachedIds, ...newIds])),
          predictedCookies,
        })
        .where(eq(projects.id, Number(params.projectId)));

      return {
        name: project.data.title ?? "Unknown",
        devlogs,
        additionCookies: previousPredicted ? additionCookies : 0,
        nextGoalItem,
        distanceFromGoal,
      };
    }
  } catch (err) {
    params.logger.error({
      error: err,
      project: {
        id: params.projectId,
      },
      location: "getNewDevlogs,topLevelTryCatch",
    });
    return;
  }
}

export default {
  name: "checkForNewDevlogs",
  execute: async ({ client, clients, prefix, pg, logger }: RequestHandler) => {
    try {
      const userRows = await pg
        .select({
          apiKey: users.apiKey,
          userId: users.userId,
          channel: users.channel,
          projects: users.projects,
          meta: users.meta,
        })
        .from(users)
        .where(
          and(
            eq(users.disabled, false),
            not(isNull(users.apiKey)),
            not(isNull(users.channel)),
            not(isNull(users.projects)),
          ),
        );
      if (!userRows?.length) {
        for (const key of Object.keys(clients)) {
          delete clients[key];
        }
        return;
      }
      const userByAPIKey = new Map(
        userRows.filter((u) => u.apiKey).map((u) => [String(u.apiKey), u]),
      );
      const projectsMap = new Map(
        (await pg.select().from(projects)).map((r) => [r.id, r]),
      );
      for (const row of userRows) {
        if (!row || !row.apiKey || !row.channel || !row.projects) continue;
        if (!clients[row.apiKey])
          clients[row.apiKey] = new FT(row.apiKey, logger);
        const userProjectIds = Array.isArray(row.projects)
          ? row.projects.map(Number)
          : [];
        for (const projectId of userProjectIds) {
          const projData = await getNewDevlogs({
            apiKey: String(row.apiKey),
            projectId,
            app: client,
            clients,
            db: pg,
            prefix: String(prefix),
            logger,
            userByAPIKey,
            projectsMap,
          });
          if (!clients[row.apiKey]) break;
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
                const timestamp = utcFormatter.format(createdAt);

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

                type Block = {
                  type: "image";
                  image_url: string;
                  alt_text: string;
                };

                const mediaBlocks: Block[] = (devlog.media || [])
                  .map((m, i): Block | null => {
                    const url = "https://flavortown.hackclub.com" + m.url;
                    const alt = String(i + 1);

                    if (m.content_type && m.content_type.startsWith("image")) {
                      return { type: "image", image_url: url, alt_text: alt };
                    }

                    return null;
                  })
                  .filter((b): b is Block => b !== null);

                const videoLinks = (devlog.media || [])
                  .filter(
                    (m) => m.content_type && m.content_type.startsWith("video"),
                  )
                  .map(
                    (m, i) =>
                      `<https://flavortown.hackclub.com${m.url}|Video ${i + 1}>`,
                  );

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
                            text: String(devlog.body)
                              .split("\n")
                              .map((line: string) => `> ${line}`)
                              .join("\n"),
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
                              text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}. ${projData.additionCookies && projData.additionCookies !== 0 ? `+${projData.additionCookies} based off predicted cookies.` : ""} ${projData.nextGoalItem && projData.distanceFromGoal && projData.distanceFromGoal > 0 ? `Next goal is ${projData.nextGoalItem} which based off of predicted is ${projData.distanceFromGoal} cookies away!` : ""}`,
                            },
                          ],
                        },
                        ...mediaBlocks,
                      ],
                    });
                  } else {
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
                              text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}. ${projData.additionCookies && projData.additionCookies !== 0 ? `+${projData.additionCookies} based off predicted cookies.` : ""} ${projData.nextGoalItem && projData.distanceFromGoal && projData.distanceFromGoal > 0 ? `Next goal is ${projData.nextGoalItem} which based off of predicted is ${projData.distanceFromGoal} cookies away!` : ""}`,
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
                      message?: string;
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
                    if (typeof error.message === "string" && error.message.includes("downloading image failed")) {
                      await client.chat.postMessage({
                        channel: row.channel,
                        text: `Hey! Your devlog post failed because the image URL isn't usable by slack. Looking at github issues of boltjs this is usually because it isn't accessible to slack but it may be other issues like slack not supporting it.`,
                      });
                      return;
                    }
                  }
                

                  logger.error(
                    "Unexpected error occured when trying to post the automated message.",
                    {
                      error: err,
                      projectId,
                      devlogId: devlog.id
                    },
                  );
                  
                  await client.chat.postMessage({
                    channel: row.channel,
                    text: `Hey! The latest devlog post didn't take place because an error occurred! Just wanted to keep you in the loop.`,
                  });
                }
              } catch (err) {
                logger.error({ error: err, projectId });
              }
            }
          }

          continue;
        }
      }
    } catch (err) {
      logger.error({
        error: err,
        location: "checkForNewDevlogs,topLevelTryCatch",
      });
    }
  },
};
