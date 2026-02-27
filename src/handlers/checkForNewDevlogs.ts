import type { WebClient } from "@slack/web-api";
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
import type FTypes from "../lib/ft.d";
import FT from "../lib/ft";
type DB =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

async function getNewDevlogs(
  apiKey: string,
  projectId: number,
  app: WebClient,
  clients: Record<string, FT>,
  db: DB,
  logger: typeof LogtapeLogger,
): Promise<{
  name: string;
  devlogs: FTypes.Devlog[];
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
    while (project.status === 429) {
      const waitMs = 2000 + Math.floor(Math.random() * 1000);
      await new Promise((res) => setTimeout(res, waitMs));
      project = await client.project({ id: Number(projectId) });
    }

    if (!project || !project.status) {
      const ctx = logger.with({
        project: {
          id: projectId,
        },
        output: {
          ok: project.ok,
          status: project.status,
          data: project.ok && project.data ? project.data : undefined,
        },
      });
      ctx.error(
        "Unexpected error where project api call returned unexpected values",
      );
      return;
    } else if (!project.ok) {
      return;
    }

    if (!project) {
      const row = await db
        .select()
        .from(users)
        .where(eq(users.apiKey, apiKey))
        .limit(1);

      const disabled = row[0]?.disabled;
      if (disabled !== true) {
        if (Number(client.lastCode) === 401) {
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
            text: "Hey! You're project has been disabled from devlog tracking because of the api key returning 401! Setup the API Key again in /logpheus-config to get it re-enabled.",
          });
        } else if (client.lastCode === 404) {
          const ctx = logger.with({
            project: {
              id: projectId,
            },
          });
          ctx.error("No project exists at id");
        } else if (
          Number(client.lastCode) >= 500 &&
          Number(client.lastCode) < 600
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
        name: project.data.title,
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
      return { name: project.data.title, devlogs: [] };
    } else {
      const devlogs: FTypes.Devlog[] = [];
      for (const id of newIds) {
        const res = await client.devlog({
          projectId: projectId,
          devlogId: id,
        });
        if (res && res.ok) devlogs.push(res.data);
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
        return { name: project.data.title, devlogs: [] };
      }

      await db
        .update(projects)
        .set({
          devlogIds: Array.from(new Set([...cachedIds, ...newIds])),
        })
        .where(eq(projects.id, Number(projectId)));

      return { name: project.data.title, devlogs };
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
  execute: async ({ client, clients, pg, logger }: RequestHandler) => {
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
            logger,
          );
          if (!projData) continue;
          if (projData.devlogs.length > 0) {
            for (const devlog of projData.devlogs) {
              try {
                const createdAt = new Date(devlog.created_at);
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
                      Math.floor(seconds / sec) %
                      (i === 0 ? Infinity : i === 1 ? 24 : 60);
                    const labels = ["day", "hour", "minute"];
                    return val > 0
                      ? `${val} ${labels[i]}${val > 1 ? "s" : ""}`
                      : null;
                  })
                  .filter(Boolean)
                  .join(" ");

                const imageBlocks = (devlog.media || []).map((m, i) => ({
                  type: "image",
                  image_url: "https://flavortown.hackclub.com" + m.url,
                  alt_text: String(i + 1),
                }));

                if (!containsMarkdown(devlog.body)) {
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
                      ...imageBlocks,
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
                      ...parseMarkdownToSlackBlocks(devlog.body),
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
                      ...imageBlocks,
                    ],
                  });
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
