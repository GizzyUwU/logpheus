import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import checkAPIKey from "../lib/apiKeyCheck";
import { getGenericErrorMessage } from "../lib/genericError";

const formatDate = (iso: string) => {
  const d = new Date(iso);

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(
    d.getUTCFullYear(),
  ).slice(-2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
};

function formatDuration(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);

  return parts.length ? parts.join(" ") : "0s";
}

export default {
  name: "project",
  params: "[projectId]",
  desc: "Look at a project's stats by providing its id!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, clients, prefix }: RequestHandler,
  ) => {
    const projectIdRaw = command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    const projectId = Number(projectIdRaw);

    if (!projectIdRaw || !Number.isInteger(projectId) || projectId <= 0)
      return respond({
        text: "Project ID must be a positive whole number.",
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

    const project = await ftClient.project({
      id: projectId,
    });

    if (!project || !project.status) {
      return respond({
        text: "Unexpected error has occurred.",
        response_type: "ephemeral",
      });
    }

    if (!project.ok || !Object.keys(project.data)?.length) {
      switch (project.status) {
        case 404:
          return respond({
            text: "This doesn't exist.",
            response_type: "ephemeral",
          });
        default:
          const msg = getGenericErrorMessage(project.status, prefix!);
          return respond({
            text: msg ?? "Unexpected error has occured!",
            response_type: "ephemeral",
          });
      }
    }

    const devlogs = await ftClient.devlogs({
      project_id: projectId,
    });

    if (!devlogs || !devlogs.status) {
      return respond({
        text: "Unexpected error has occurred.",
        response_type: "ephemeral",
      });
    }

    if (!devlogs.ok || !Object.keys(devlogs.data)?.length) {
      switch (devlogs.status) {
        case 404:
          return respond({
            text: "Project doesn't exist.",
            response_type: "ephemeral",
          });
        default:
          const msg = getGenericErrorMessage(devlogs.status, prefix!);
          return respond({
            text: msg ?? "Unexpected error has occurred!",
            response_type: "ephemeral",
          });
      }
    }

    const totalSeconds = (devlogs.data.devlogs ?? []).reduce(
      (sum, log) => sum + (log.duration_seconds ?? 0),
      0,
    );

    const avgSeconds = (devlogs.data.devlogs ?? []).length
      ? Math.round(
          (devlogs.data.devlogs ?? []).reduce(
            (sum, log) => sum + (log.duration_seconds ?? 0),
            0,
          ) / (devlogs.data.devlogs ?? []).length,
        )
      : 0;

    const userText = [
      {
        label: "Project ID",
        value: `<https://flavortown.hackclub.com/projects/${project.data.id}|${project.data.id}>`,
      },
      { label: "Description", value: project.data.description },
      {
        label: "Created at",
        value: project.data.created_at
          ? formatDate(project.data.created_at)
          : "You are hallucinating this project never was created",
      },
      {
        label: "Last Updated at",
        value: project.data.updated_at
          ? formatDate(project.data.updated_at)
          : "Never",
      },
      {
        label: "Project Hours",
        value: formatDuration(totalSeconds) || "0h",
      },
      {
        label: "Average Devlog Time",
        value: formatDuration(avgSeconds) || "0s",
      },
      {
        label: "Predicted Cookies",
        value: Math.round(10 * (totalSeconds / 3600)) + " " + ":cookie:", // Based off 10 cookies per hour average
      },
      {
        label: "Ship Status",
        value: project.data.ship_status,
      },
      ...(project.data.ai_declaration
        ? [{ label: "Used AI", value: project.data.ai_declaration }]
        : []),
      {
        label: "Devlog",
        value: (project.data.devlog_ids ?? [])
          .map((id: string | number) => id)
          .join(", "),
      },
    ]
      .map((f) => `*${f.label}*: ${f.value}`)
      .join("\n");
    return respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: project.data.title ?? "Unknown",
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: userText,
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
              text: `${project.data.repo_url ? "<" + project.data.repo_url + "|Repository>" : ""} ${project.data.readme_url ? "<" + project.data.readme_url + "|README>" : ""} ${project.data.demo_url ? "<" + project.data.demo_url + "|Demo>" : ""}`,
            },
          ],
        },
        ...(project.data.banner_url
          ? ([
              {
                type: "image",
                image_url:
                  "https://flavortown.hackclub.com" + project.data.banner_url,
                alt_text: "Project Banner",
              },
            ] as {
              type: string;
              image_url: string;
              alt_text: string;
            }[])
          : []),
      ],
      response_type: "ephemeral",
    });
  },
};
