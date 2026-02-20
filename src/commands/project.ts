import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import checkAPIKey from "../lib/apiKeyCheck";

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

    const working = await checkAPIKey(pg, apiKey, logger);
    if (!working)
      return respond({
        text: `Hey! Your api key is currently failing the test to see if it works, run /${prefix}-config to re-enter your api key to fix it.`,
        response_type: "ephemeral",
      });

    let ftClient: FT = clients[apiKey]!;
    if (!ftClient) {
      ftClient = new FT(apiKey, logger);
    }

    const project = await ftClient.project({
      id: projectId,
    });

    if (project.status === 404 || project.ok && !project.data)
      return respond({
        text: `This project doesn't exist!`,
        response_type: "ephemeral",
      });
    else if (!project.ok)
      return respond({
        text: `Unexpected error has occurred.`,
        response_type: "ephemeral",
      });

    const userText = [
      { label: "Project ID", value: project.data.id },
      { label: "Description", value: project.data.description },
      { label: "Created at", value: formatDate(project.data.created_at) },
      { label: "Last Updated at", value: formatDate(project.data.updated_at) },
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
          .map(
            (id: string | number) =>
              `<https://flavortown.hackclub.com/projects/${project.data.id}|${id}>`,
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
            text: project.data.title,
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
              text: `${project.data.repo_url ? "<" + project.data.repo_url + "|Repo>" : ""} ${project.data.readme_url ? "<" + project.data.readme_url + "|Read me>" : ""} ${project.data.demo_url ? "<" + project.data.demo_url + "|Demo>" : ""}`,
            },
          ],
        },
      ],
      response_type: "ephemeral",
    });
  },
};
