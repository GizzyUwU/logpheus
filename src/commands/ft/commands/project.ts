import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "@/lib/ft/index";
import type { RequestHandler } from "@/index.ts";
import checkAPIKey from "@/lib/ft/apiKeyCheck";
import { getGenericErrorMessage } from "@/lib/genericError";

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
    { pg, logger,  yswsClient, prefix, folder, yswsData }: RequestHandler,
  ) => {
    const projectId = Number(
      command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim(),
    );

    if (!projectId || !Number.isInteger(projectId) || projectId <= 0)
      return respond({
        text: "Project ID must be a positive whole number.",
        response_type: "ephemeral",
      });

    if (yswsData && Object.keys(yswsData).length === 0)
      return respond({
        text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
        response_type: "ephemeral",
      });

    const apiKey = String(yswsData?.apiKey);

    const working = await checkAPIKey({
      db: pg,
      apiKey,
      yswsData: yswsData!,
      userId: command.user_id,
      logger,
    });

    if (!working.works)
      return respond({
        text: `Hey! Your api key is currently failing the test to see if it works, run /${prefix}-${folder} config to re-enter your api key to fix it.`,
        response_type: "ephemeral",
      });

    if (!yswsClient)
      return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

    let ftClient: FT = yswsClient.raw as FT;

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
