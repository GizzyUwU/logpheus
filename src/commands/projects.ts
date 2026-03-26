import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import checkAPIKey from "../lib/apiKeyCheck";
import { getGenericErrorMessage } from "../lib/genericError";

function parseProjectCommand(text: string) {
  const tokens = text.trim().split(/\s+/);

  let queryParts: string[] = [];
  let page: number | undefined;
  let limit = 30;

  const clamp = (num: number, min: number, max: number) =>
    Math.min(Math.max(num, min), max);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === "--page") {
      const val = Number(tokens[i + 1]);
      if (Number.isInteger(val) && val > 0) {
        page = val;
        i++;
      }
    } else if (token === "--limit") {
      const val = Number(tokens[i + 1]);
      if (Number.isInteger(val) && val > 0) {
        limit = clamp(val, 1, 70);
        i++;
      }
    } else {
      queryParts.push(String(token));
    }
  }

  return {
    query: queryParts.length ? queryParts.join(" ") : undefined,
    page,
    limit,
  };
}

export default {
  name: "projects",
  params: "[projectName] [--page (integer)] [--limit (integer >= 70)]",
  desc: "Search through all the projects on flavortown.",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, clients, prefix }: RequestHandler,
  ) => {
    const { query: actualQuery, page: actualPage, limit } =
      parseProjectCommand(command.text);
    
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
      limit,
    });

    if (!projects || !projects.status) {
      return respond({
        text: "Unexpected error has occurred.",
        response_type: "ephemeral",
      });
    }

    if (!projects.ok || !projects.data.projects?.length) {
      switch (projects.status) {
        case 404:
          return respond({
            text: "No projects exist?.",
            response_type: "ephemeral",
          });
        default:
          const msg = getGenericErrorMessage(projects.status, prefix!);
          return respond({
            text: msg ?? "Unexpected error has occured!",
            response_type: "ephemeral",
          });
      }
    }

    return respond({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              "*Projects*:\n" +
              ( (projects.data.projects ?? []).length
                ?  (projects.data.projects ?? [])
                    .map((item) => `• ${item.id} - ${item.title} - ${item.ship_status} - ${item.ai_declaration || "No"}`)
                    .join("\n")
                : "No projects exist here."),
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "plain_text",
              text: "Format as 'ID - Title - Ship Status - AI Declaration'",
            },
          ],
        },
      ],
      response_type: "ephemeral",
    });
  },
};
