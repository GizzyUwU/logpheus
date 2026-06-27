import type { RichTextBlock, WebClient } from "@slack/web-api";
import { users } from "@/schema/users";
import { projects } from "@/schema/projects";
import { and, eq, isNull, not } from "drizzle-orm";
import { containsMarkdown } from "@/lib/parseMarkdown";
import { parseMarkdownToSlackBlocks } from "@/lib/parseMarkdown";
import type { logger as LogtapeLogger, RequestHandler } from "@/index.ts";
import { z } from "zod";
import ysws from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import type { GetDevlogResponse } from "@/lib/ft/types";
import { yswsUsers } from "@/schema/ysws";
import type { ApiAdapter, CanonicalShopItem } from "@/lib/adapters/types";
import type { DatabaseType } from "@/index.ts";
const utcFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

export function resolveItemCost(
  item: CanonicalShopItem,
  region?: string | null,
): number {
  if (region && region.length > 0) {
    return item.regionalCosts[region.toLowerCase()]?.currency ?? item.baseCost;
  }
  return item.baseCost;
}

async function getNewDevlogs(params: {
  apiKey: string;
  projectId: number;
  app: WebClient;
  clients: Record<string, ApiAdapter>;
  clientKey: string;
  db: DatabaseType;
  prefix: string;
  logger: typeof LogtapeLogger;
  userByUserId: Map<string, Partial<typeof users.$inferSelect>>;
  userRow: Partial<typeof users.$inferSelect>;
  yswsRow: Partial<typeof yswsUsers.$inferSelect>;
  projectRow: typeof projects.$inferSelect;
}): Promise<{
  name: string;
  devlogs: z.infer<typeof GetDevlogResponse>[];
  additionCurrency?: number;
  nextGoalItem?: string;
  distanceFromGoal?: number;
} | void> {
  try {
    let client = params.clients[params.clientKey];
    if (!client) {
      params.logger.error("No YSWS Client for the project", {
        project: {
          id: params.projectId,
        },
      });
      return;
    }

    let project = await client.project({ id: Number(params.projectRow.id) });

    if (!project || !project.status) {
      const row = params.userByUserId.get(params.userRow.userId!);
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
        project = await client.project({ id: Number(params.projectRow.id) });
      }
    }

    if (!Object.keys(project).length || !project.ok || !project.data) {
      const row = params.userByUserId.get(params.userRow.userId!);
      if (project.status === 200) return;
      if (project.status === 401) {
        delete params.clients[params.clientKey];
        await params.db
          .update(yswsUsers)
          .set({
            disabled: true,
          })
          .where(
            and(
              eq(yswsUsers.userId, params.userRow.userId!),
              eq(yswsUsers.yswsId, params.yswsRow.yswsId!),
            ),
          );

        if (!row?.channel) return;
        await params.app.chat.postMessage({
          channel: row?.channel,
          text: `Hey! You're project has been disabled from devlog tracking because of the api key returning 401! Setup the API Key again in /${params.prefix}-config to get it re-enabled.`,
        });
        return;
      } else if (project.status === 404) {
        delete params.clients[params.clientKey];
        await params.db
          .update(yswsUsers)
          .set({
            disabled: true,
          })
          .where(
            and(
              eq(yswsUsers.userId, params.userRow.userId!),
              eq(yswsUsers.yswsId, params.yswsRow.yswsId!),
            ),
          );

        const yswsConfig = Object.values(ysws).find(
          (y) => y.id === params.yswsRow.yswsId,
        );
        if (!row?.channel) return;
        await params.app.chat.postMessage({
          channel: row?.channel,
          text: `Hey! You got disabled because of ${params.projectRow.id} no longer exist and is 404ing. To get re-enabled run /${params.prefix}-${yswsConfig?.short} remove ${params.projectRow.id} and then /${params.prefix}-${yswsConfig?.short} reactivate.`,
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
            id: params.projectRow.id,
            yswsId: params.yswsRow.yswsId,
            user: params.userRow.userId,
            accId: params.yswsRow.accId ? params.yswsRow.accId : "Not set",
          },
        });
        return;
      }
    }

    const devlogIds = Array.isArray(project?.data.devlogIds)
      ? project.data.devlogIds
      : [];

    let cachedIds: number[] = [];

    if (Object.keys(params.projectRow).length > 0) {
      try {
        cachedIds = params.projectRow.devlogIds?.map(Number) ?? [];
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
        if ((data?.items?.length ?? 0) > 0) {
          for (const log of data?.items ?? []) {
            devlogS.push(Number(log.duration_seconds));
            if (newIds.includes(Number(log.id))) {
              devlogs.push(log);
            }
          }
        }
        page = data?.next_page ?? null;
      }

      const totalSeconds = (devlogS ?? []).reduce((sum, item) => sum + item, 0);
      const predictedCurrency = Math.round(
        (params.projectRow?.multiplier ?? 10) * (totalSeconds / 3600),
      );
      const previousPredicted = params.projectRow?.predictedCurrency ?? 0;

      let nextGoalItem = "";
      let distanceFromGoal = 0;
      let additionCurrency = 0;

      const meUser = await client.user({ id: "me" });
      if (meUser.ok && meUser.data && Object.keys(meUser?.data)?.length) {
        if (previousPredicted) {
          additionCurrency = Math.max(0, predictedCurrency - previousPredicted);
        }

        if (params.yswsRow?.goals && params.yswsRow.goals.length > 0) {
          const shop = await client.shop();
          if (shop.ok && shop.data?.length) {
            const region = params.yswsRow?.region;

            for (const goalId of params.yswsRow.goals) {
              const item = shop.data.find((s) => s.id === goalId);
              if (!item) continue;

              const cost = resolveItemCost(item, region);
              if (Number(meUser.data.currency) + predictedCurrency < cost) {
                nextGoalItem = String(item.name);
                distanceFromGoal =
                  cost - (Number(meUser.data.currency) + predictedCurrency);
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
          predictedCurrency,
        })
        .where(
          and(
            eq(projects.id, Number(params.projectId)),
            eq(projects.ysws, params.yswsRow.yswsId!),
          ),
        );

      return {
        name: project.data.title ?? "Unknown",
        devlogs,
        additionCurrency: previousPredicted ? additionCurrency : 0,
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
          userId: users.userId,
          channel: users.channel,
          pingGroup: users.pingGroup
        })
        .from(users)
        .where(and(eq(users.disabled, false), not(isNull(users.channel))));

      const yswsRows = await pg
        .select({
          yswsId: yswsUsers.yswsId,
          projects: yswsUsers.projects,
          userId: yswsUsers.userId,
          apiKey: yswsUsers.apiKey
        })
        .from(yswsUsers)
        .where(
          and(eq(yswsUsers.disabled, false), not(isNull(yswsUsers.projects))),
        );

      if (!userRows?.length) {
        for (const key of Object.keys(clients)) {
          delete clients[key];
        }
        return;
      }
      const userByUserId = new Map(
        userRows.filter((u) => u.userId).map((u) => [String(u.userId), u]),
      );

      const projectRows = await pg.select().from(projects)
      const projectsByKey = new Map<string, typeof projects.$inferSelect[]>();
      for (const project of projectRows) {
        if (!project.userId) return;
        const key = `${project.userId}:${project.ysws}`;
        if (!projectsByKey.has(key)) projectsByKey.set(key, []);
        projectsByKey.get(key)!.push(project)
      }

      for (const yswsRow of yswsRows) {
        const userRow = userRows.find((u) => u.userId === yswsRow?.userId);
        if (!userRow?.channel) continue;
        const yswsConfig = Object.values(ysws).find(
          (y) => y.id === yswsRow.yswsId,
        );
        if (!yswsConfig) continue;
        if (!yswsConfig.jobs.includes("newDevlog")) continue;
        if (yswsConfig.apiKeyRequired && !yswsRow.apiKey) continue;

        const userProjects = projectsByKey.get(`${yswsRow.userId}:${yswsRow.yswsId}`)
        if (!userProjects || userProjects.length === 0) continue;
        const clientKey = `${yswsRow.yswsId}:${yswsRow.userId ?? "no-key"}`;
        if (!clients[clientKey]) {
          const AdapterClass = await loadAdapter(yswsConfig.adapter);
          clients[clientKey] = new AdapterClass(
            yswsConfig.apiKeyRequired ? yswsRow.apiKey : undefined,
            logger,
          );
        }

        for (const project of userProjects) {
          const projData = await getNewDevlogs({
            apiKey: String(yswsRow.apiKey),
            projectId: project.id,
            app: client,
            clients,
            clientKey,
            db: pg,
            prefix: String(prefix),
            logger,
            userByUserId,
            userRow,
            yswsRow,
            projectRow: project,
          });
          if (!clients[clientKey]) break;
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
                    const url = m.url?.includes("https")
                      ? m.url
                      : yswsConfig.mediaUrl + m.url;
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
                      `<${m.url?.includes("https") ? m.url : yswsConfig.mediaUrl + m.url}|Video ${i + 1}>`,
                  );

                const pingGroupId = userRow?.pingGroup;
                try {
                  if (devlog.body && !containsMarkdown(devlog.body)) {
                    await client.chat.postMessage({
                      channel: userRow.channel,
                      unfurl_links: false,
                      unfurl_media: true,
                      blocks: [
                        {
                          type: "section",
                          text: {
                            type: "mrkdwn",
                            text: `:shipitparrot: <${yswsConfig.url}/projects/${project.id}|${projData.name}> got a new devlog posted! :shipitparrot:`,
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
                                        usergroup_id: pingGroupId,
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
                              text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> ${seconds !== 0 ? `and took ${durationString}.` : ""} ${projData.additionCurrency && projData.additionCurrency !== 0 ? `+${projData.additionCurrency} based off predicted ${yswsConfig.currencyName}.` : ""} ${projData.nextGoalItem && projData.distanceFromGoal && projData.distanceFromGoal > 0 ? `Next goal is ${projData.nextGoalItem} which based off of predicted is ${projData.distanceFromGoal} ${yswsConfig.currencyName} away!` : ""}`,
                            },
                          ],
                        },
                        ...mediaBlocks,
                      ],
                    });
                  } else {
                    await client.chat.postMessage({
                      channel: userRow.channel,
                      unfurl_links: false,
                      unfurl_media: true,
                      blocks: [
                        {
                          type: "section",
                          text: {
                            type: "mrkdwn",
                            text: `:shipitparrot: <${yswsConfig.url}/projects/${project.id}|${projData.name}> got a new devlog posted! :shipitparrot:`,
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
                                        usergroup_id: pingGroupId,
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
                              text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> ${seconds !== 0 ? `and took ${durationString}.` : ""} ${projData.additionCurrency && projData.additionCurrency !== 0 ? `+${projData.additionCurrency} based off predicted ${yswsConfig.currencyName}.` : ""} ${projData.nextGoalItem && projData.distanceFromGoal && projData.distanceFromGoal > 0 ? `Next goal is ${projData.nextGoalItem} which based off of predicted is ${projData.distanceFromGoal} ${yswsConfig.currencyName} away!` : ""}`,
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
                      if (!userRow.userId) continue;
                      delete clients[clientKey];
                      await pg
                        .update(yswsUsers)
                        .set({
                          disabled: true,
                        })
                        .where(
                          and(
                            eq(yswsUsers.userId, userRow.userId),
                            eq(yswsUsers.yswsId, yswsRow.yswsId),
                          ),
                        );
                      await client.chat.postMessage({
                        channel: userRow.userId,
                        text: `Hey! The automated devlog poster has been disabled for you because I am not in the channel where it's meant to be sent in. Add me to the channel and run /${prefix}-reactivate to get it enabled.`,
                      });
                      continue;
                    }
                    if (
                      typeof error.message === "string" &&
                      error.message.includes("downloading image failed")
                    ) {
                      await client.chat.postMessage({
                        channel: userRow.channel,
                        text: `Hey! Your devlog post failed because the image URL isn't usable by slack. Looking at github issues of boltjs this is usually because it isn't accessible to slack but it may be other issues like slack not supporting it.`,
                      });
                      continue;
                    }
                  }

                  logger.error(
                    "Unexpected error occured when trying to post the automated message.",
                    {
                      error: err,
                      projectId: project.id,
                      devlogId: devlog.id,
                    },
                  );

                  await client.chat.postMessage({
                    channel: userRow.channel,
                    text: `Hey! The latest devlog post didn't take place because an error occurred! Just wanted to keep you in the loop.`,
                  });
                }
              } catch (err) {
                logger.error({ error: err, projectId: project.id });
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
