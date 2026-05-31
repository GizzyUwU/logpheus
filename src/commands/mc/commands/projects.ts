import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { getGenericErrorMessage } from "@/lib/genericError";
import type Macondo from "@/lib/macondo";

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
    { yswsClient, prefix, folder, yswsData }: RequestHandler,
  ) => {
    if (yswsData && Object.keys(yswsData).length === 0)
      return respond({
        text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
        response_type: "ephemeral",
      });

    const {
      query: actualQuery,
      page: actualPage,
      limit,
    } = parseProjectCommand(command.text);

    if (!yswsClient)
      return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

    const mcClient: Macondo = yswsClient.raw as Macondo;
    const cursor =
      actualPage !== undefined
        ? (actualPage - 1) * limit
        : undefined;
    
    const projects = await mcClient.projects({
      ...(actualQuery !== undefined && actualQuery.length !== 0 ? { search: actualQuery } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
      limit,
    });

    if (!projects || !projects.status) {
      return respond({
        text: "Unexpected error has occurred.",
        response_type: "ephemeral",
      });
    }

    if (!projects.ok || !projects.data.items?.length) {
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
              ((projects.data.items ?? []).length
                ? (projects.data.items ?? [])
                    .map(
                      (item) =>
                        `• ${item.id} - ${item.name} - ${item.has_shipped} - ${item.level || "1"}`,
                    )
                    .join("\n")
                : "No projects exist here."),
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "plain_text",
              text: "Format as 'ID - Title - Shipped? - Level'",
            },
          ],
        },
      ],
      response_type: "ephemeral",
    });
  },
};
