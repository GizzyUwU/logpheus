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
import type { RequestHandler } from "..";
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
  sentryEnabled: boolean,
  Sentry: typeof import("@sentry/bun"),
): Promise<{
  name: string;
  devlogs: FTypes.Devlog[];
  shipped?: "pending" | "submitted";
} | void> {
  try {
    const client = clients[apiKey];
    if (!client) {
      if (sentryEnabled) {
        Sentry.setContext("project", {
          id: projectId,
        });
        Sentry.captureMessage("No FT Client for the project", {
          level: "error",
        });
      } else {
        console.error(`No FT client for project ${projectId}`);
      }
      return;
    }
    const project = await client.project({ id: Number(projectId) });
    if (!project) {
      const row = await db
        .select()
        .from(users)
        .where(eq(users.apiKey, apiKey))
        .limit(1);

      const disabled = row[0]?.disabled;
      if (disabled !== true) {
        if (client.lastCode === 401) {
          await db
            .update(users)
            .set({
              disabled: true,
            })
            .where(eq(users.apiKey, apiKey));

          await app.chat.postMessage({
            channel: String(row[0]?.channel),
            text: "Hey! You're project has been disabled from devlog tracking because of the api key returning 401! Setup the API Key again in /logpheus-config to get it re-enabled.",
          });
        } else if (client.lastCode === 404) {
          if (sentryEnabled) {
            Sentry.setContext("project", {
              id: projectId,
            });
            Sentry.captureMessage("No project exists at id", {
              level: "error",
            });
          } else {
            console.error("No project exists at id", projectId);
          }
        } else {
          if (sentryEnabled) {
            Sentry.setContext("project", {
              id: projectId,
            });
            Sentry.captureMessage(
              client.lastCode + " " + "Failed to get project",
              {
                level: "error",
              },
            );
          } else {
            console.error(client.lastCode, "Failed to get project", projectId);
          }
        }
      }

      return;
    }

    const devlogIds = Array.isArray(project?.devlog_ids)
      ? project.devlog_ids
      : [];

    const row = await db
      .select()
      .from(projects)
      .where(eq(projects.id, Number(projectId)));

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

    if (newIds.length > 0) {
      await db
        .update(projects)
        .set({
          devlogIds: Array.from(new Set([...cachedIds, ...newIds])),
        })
        .where(eq(projects.id, Number(projectId)));
    }

    if (newIds.length === 0) {
      return { name: project.title, devlogs: [] };
    }

    const devlogs: FTypes.Devlog[] = [];
    for (const id of newIds) {
      const res = await client.devlog({
        projectId: Number(projectId),
        devlogId: id,
      });
      if (res) devlogs.push(res);
    }

    return { name: project.title, devlogs };
  } catch (err) {
    if (sentryEnabled) {
      Sentry.setContext("project", {
        id: projectId,
      });
      Sentry.captureException(err);
    } else {
      console.error(`Error fetching devlogs for project ${projectId}:`, err);
    }
    return;
  }
}

export default {
  name: "checkForNewDevlogs",
  execute: async ({
    client,
    clients,
    pg,
    sentryEnabled,
    Sentry,
  }: RequestHandler) => {
    const userRows = await pg.select().from(users);
    if (!userRows?.length) return;
    for (const row of userRows) {
      if (!row || !row.apiKey || !row.channel || !row.projects) continue;
      if (!clients[row.apiKey]) clients[row.apiKey] = new FT(row.apiKey);
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
          sentryEnabled,
          Sentry,
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

              if (!containsMarkdown(devlog.body)) {
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
                          text: `Devlog created at <https://time.cs50.io/${cs50Timestamp}|${timestamp}> and took ${durationString}.`,
                        },
                      ],
                    },
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
                  ],
                });
              }
            } catch (err) {
              if (sentryEnabled) {
                Sentry.setContext("project", {
                  id: projectId,
                });
                Sentry.captureException(err);
              } else {
                console.error(
                  `Error posting to Slack for project ${projectId}:`,
                  err,
                );
              }
            }
          }
        }

        await new Promise((res) => setTimeout(res, 2000));
        continue;
      }
    }
  },
};
