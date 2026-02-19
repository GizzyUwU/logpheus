import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";

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
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, clients, prefix }: RequestHandler,
  ) => {
    const projectId = command.text.trim();
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

    const apiKey = userData[0]?.apiKey;
    if (!apiKey) {
      const ctx = logger.with({
        user: {
          id: command.user_id,
        },
      });
      ctx.error("User exists in db but lacks an api key in it");
      return respond({
        text: `Hey! Basically you exist in db and lack an api key try fix it using /${prefix}-config`,
        response_type: "ephemeral",
      });
    }

    let ftClient: FT = clients[apiKey]!;
    if (!ftClient) {
      ftClient = new FT(apiKey, logger);
    }

    const project = await ftClient.project({
      id: projectId,
    });

    if (ftClient.lastCode === 404 || !project)
      return respond({
        text: `This project doesn't exist!`,
        response_type: "ephemeral",
      });

    const userText = [
      { label: "Project ID", value: project.id },
      { label: "Description", value: project.description },
      { label: "Created at", value: formatDate(project.created_at) },
      { label: "Last Updated at", value: formatDate(project.updated_at) },
      {
        label: "Ship Status",
        value: project.ship_status,
      },
      ...(project.ai_declaration
        ? [{ label: "Used AI", value: project.ai_declaration }]
        : []),
      {
        label: "Devlog",
        value: (project.devlog_ids ?? [])
          .map(
            (id: string | number) =>
              `<https://flavortown.hackclub.com/projects/${project.id}|${id}>`,
          )
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
            text: project.title,
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
              text: `${project.repo_url ? "<" + project.repo_url + "|Repo>" : ""} ${project.readme_url ? "<" + project.readme_url + "|Read me>" : ""} ${project.demo_url ? "<" + project.demo_url + "|Demo>" : ""}`,
            },
          ],
        },
      ],
      response_type: "ephemeral",
    });
  },
};
