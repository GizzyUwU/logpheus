import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import type { RichTextBlock } from "@slack/web-api";
import checkAPIKey from "../lib/apiKeyCheck";

export default {
  name: "projects",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, clients, prefix }: RequestHandler,
  ) => {
    const parts = command.text.trim().split(" ").filter(Boolean);

    let actualQuery: string | undefined;
    let actualPage: number | undefined;

    if (parts.length > 0) {
      if (parts.length >= 2) {
        const maybePage = Number(parts[1]);
        if (Number.isInteger(maybePage) && maybePage > 0) {
          actualPage = maybePage;
          actualQuery = [parts[0], ...parts.slice(2)].join(" ").trim();
          if (actualQuery.length === 0) {
            actualQuery = parts[0];
          }
        } else {
          actualQuery = parts.join(" ");
        }
      } else {
        actualQuery = parts[0];
      }
    }
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

    const projects = await ftClient.projects({
      ...(actualQuery !== undefined ? { query: actualQuery } : {}),
      ...(actualPage !== undefined ? { page: actualPage } : {}),
    });

    if (!projects || !projects.status) {
      return respond({
        text: "Unexpected error has occurred.",
        response_type: "ephemeral",
      });
    }

    if (!projects.ok || !projects.data.projects?.length) {
      switch (projects.status) {
        case 401:
          return respond({
            text: "Bad API Key! Run /" + prefix + "-config to fix!",
            response_type: "ephemeral",
          });
        default:
          return respond({
            text: "User doesn't have an FT account.",
            response_type: "ephemeral",
          });
      }
    }

    const projectRows: RichTextBlock[][] = (projects.data.projects ?? [])
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
