import type { RequestHandler } from "@/index";
import { getGenericErrorMessage } from "@/lib/genericError";
import type SDJam from "@/lib/sdjam";
import type { SlackCommandMiddlewareArgs } from "@slack/bolt";

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(
    d.getUTCFullYear(),
  ).slice(-2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
};

export default {
  name: "project",
  params: "[projectId]",
  desc: "Find a project by its id",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { yswsClient, prefix }: RequestHandler,
  ) => {
    const projectId = Number(command.text);
    if (!projectId || !Number.isInteger(projectId) || projectId <= 0)
      return respond({
        text: "Project ID must be a postive number.",
        response_type: "ephemeral",
      });

    const sdClient: SDJam = yswsClient?.raw as SDJam;
    const project = await sdClient.project({
      id: projectId,
    });

    if (!project || !project.status)
      return respond({
        text: "Unexpected error has occurred.",
        response_type: "ephemeral",
      });

    if (!project.ok || !Object.keys(project.data)?.length) {
      switch (project.status) {
        case 404:
          return respond({
            text: "This project doesn't exist.",
            response_type: "ephemeral",
          });
        default:
          const msg = getGenericErrorMessage(project.status, prefix!);
          return respond({
            text: msg ?? "Unexpected error has occurred!",
            response_type: "ephemeral",
          });
      }
    }

    const userText = [
      {
        label: "Project Id",
        value: `<https://stardance.hackclub.com/projects/${project.data.id}|${project.data.id}>`,
      },
      {
        label: "Description",
        value: project.data.description,
      },
      {
        label: "Created at",
        value: formatDate(project.data.created_at!),
      },
      {
        label: "Last updated at",
        value: project.data.updated_at
          ? formatDate(project.data.updated_at)
          : "Never",
      },
      {
        label: "AI Declaration",
        value: project.data.ai_declaration ?? "No AI Declaration Set",
      },
      {
        label: "Author",
        value: `<https://stardance.hackclub.com/users/${project.data.user_id}|${project.data.username}>`,
      },
      {
        label: "Superstar?",
        value: project.data.superstar ? "Yes!" : "No",
      },
      {
        label: "Ship Status",
        value: project.data.ship_status ?? "No ship status yet",
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
        }
      ],
      response_type: "ephemeral"
    });
  },
};
