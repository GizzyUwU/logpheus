import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import type { RichTextBlock } from "@slack/web-api";

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
  name: "projects",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, clients, prefix }: RequestHandler,
  ) => {
    const [query, pageNum, projectQuery] = command.text
      .trim()
      .split(" ")
      .filter(Boolean);
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

    const actualQuery = String(query).length > 0 ? query : projectQuery;

    const actualPage = query === "page" && pageNum ? pageNum : undefined;

    const projects = await ftClient.projects(
      actualQuery!.length > 0 || actualPage !== undefined
        ? {
            query: actualQuery!.length > 0 && actualQuery !== "page" ? actualQuery : projectQuery!.length > 0 ? projectQuery : undefined,
            page: Number(actualPage),
          }
        : undefined,
    );

    if (
      ftClient.lastCode === 404 ||
      !projects ||
      (projects.projects ?? []).length === 0
    ) {
      if (String(query).length > 0 || String(projectQuery).length > 0) {
        return respond({
          text: `No projects with this search query exist.`,
          response_type: "ephemeral",
        });
      } else {
        return respond({
          text: `No projects exist?`,
          response_type: "ephemeral",
        });
      }
    }

    const projectRows: RichTextBlock[][] = (projects.projects ?? [])
      .slice(0, 99)
      .flatMap((project) => [
        [
          {
            type: "rich_text" as const,
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "text", text: project.title ?? "Untitled" }],
              },
            ],
          },
          {
            type: "rich_text" as const,
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "text", text: String(project.id ?? "—") }],
              },
            ],
          },
          {
            type: "rich_text" as const,
            elements: [
              {
                type: "rich_text_section",
                elements: [{ type: "text", text: project.ship_status ?? "—" }],
              },
            ],
          },
          {
            type: "rich_text" as const,
            elements: [
              {
                type: "rich_text_section",
                elements: [
                  { type: "text", text: project.ai_declaration || "No" },
                ],
              },
            ],
          },
        ] as RichTextBlock[],
      ]);

    return respond({
      blocks: [
        {
          type: "table",
          rows: [
            [
              {
                type: "rich_text",
                elements: [
                  {
                    type: "rich_text_section",
                    elements: [
                      {
                        type: "text",
                        text: "Project Name",
                        style: { bold: true },
                      },
                    ],
                  },
                ],
              },
              {
                type: "rich_text",
                elements: [
                  {
                    type: "rich_text_section",
                    elements: [
                      {
                        type: "text",
                        text: "Project ID",
                        style: { bold: true },
                      },
                    ],
                  },
                ],
              },
              {
                type: "rich_text",
                elements: [
                  {
                    type: "rich_text_section",
                    elements: [
                      {
                        type: "text",
                        text: "Ship Status",
                        style: { bold: true },
                      },
                    ],
                  },
                ],
              },
              {
                type: "rich_text",
                elements: [
                  {
                    type: "rich_text_section",
                    elements: [
                      { type: "text", text: "Used AI", style: { bold: true } },
                    ],
                  },
                ],
              },
            ],
            ...projectRows,
          ],
        },
      ],
      response_type: "ephemeral",
    });
  },
};
