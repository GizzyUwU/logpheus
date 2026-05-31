import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { getGenericErrorMessage } from "@/lib/genericError";
import type Macondo from "@/lib/macondo";

const currencyPerHourPerStage = {
  1: 40,
  2: 45,
  3: 50,
  4: 60,
} as const;

type Stage = keyof typeof currencyPerHourPerStage;

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
  desc: "Look at a project's stats by providing its id!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { yswsClient, prefix, folder, yswsData }: RequestHandler,
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

    if (!yswsClient)
      return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

    const mcClient: Macondo = yswsClient.raw as Macondo;

    const project = await mcClient.project({
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

    const streakBonus = 1 + (project.data.project_streak_days ?? 0) * 0.01;
    const stage = (project.data.stage ?? 1) as Stage;

    const userText = [
      {
        label: "Project ID",
        value: `<https://macondo.hackclub.com/projects/${project.data.id}|${project.data.id}>`,
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
        label: "Unshipped Journal Hours",
        value:
          project.data.unshippedJournalHours !== null
            ? project.data.unshippedJournalHours + "hrs"
            : "0hrs",
      },

      // {
      //   label: "Hackatime Hours",
      //   value:
      //     formatDuration(hackatimeData.data.total_seconds_in_window) + "hrs" ||
      //     "0h",
      // },
      {
        label: `Predicted ${project.data.fruit}`,
        value:
          Math.round(project.data.unshippedJournalHours ?? 0) *
          currencyPerHourPerStage[stage] *
          streakBonus,
      },
      {
        label: "Streak Bonus",
        value: streakBonus,
      },
      // {
      //   label: "Contributors",
      //   value:
      //     hackatimeMentalBreakdown.data.contributors
      //       ?.map(
      //         (c) =>
      //           `<https://macondo.hackclub.com/u/${c.user_id}|${c.username}>`,
      //       )
      //       .join(", ") ?? "None",
      // },
      {
        label: "Journals",
        value: (project.data.journals ?? [])
          .map((entry) => entry.id)
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
            text: project.data.name ?? "Unknown",
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
              text: `${project.data.repository_url ? "<" + project.data.repository_url + "|Repository>" : ""}  ${project.data.demo_url ? "<" + project.data.demo_url + "|Demo>" : ""}`,
            },
          ],
        },
        ...(project.data.thumbnail_url
          ? ([
              {
                type: "image",
                image_url: project.data.thumbnail_url,
                alt_text: "Project Thumbnail",
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
