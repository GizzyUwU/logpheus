import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { getGenericErrorMessage } from "@/lib/genericError";
import type SDJam from "@/lib/sdjam";
import { markdownTable } from "markdown-table";

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
      console.log("meow");
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
  desc: "Search through all the projects.",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { yswsClient, prefix }: RequestHandler,
  ) => {
    const { query, page: userPage, limit } = parseProjectCommand(command.text);
    const client: SDJam = yswsClient!.raw as SDJam;
    const cursor =
      userPage && userPage > 0 ? (userPage - 1) * limit : undefined;
    const projects = await client.projects({
      query,
      page: cursor,
      limit,
    });
    if (!projects || !projects.status) {
      return respond({
        text: "Unexpected error has occurred.",
        response_type: "ephemeral",
      });
    }

    if (!projects.ok) {
      switch (projects.status) {
        case 404:
          return respond({
            text: "No projects exist?",
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

    if (!projects.data.projects?.length)
      return respond({
        text: "There is no projects to view on this page!",
        response_type: "ephemeral",
      });

    let tableArr = [["Id", "Title", "Ship Status", "Used AI"]];
    projects.data.projects.forEach((p) =>
      tableArr.push([
        String(p.id),
        p.title,
        p.ship_status ?? "None",
        String(p.ai_declaration).length > 0 ? "True" : "False",
      ]),
    );

    const table = markdownTable(tableArr);
    return respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Projects index by API ${projects.data.pagination?.current_page}/${projects.data.pagination?.total_pages}:`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: table ? "```\n" + table + "```" : "No projects available",
          },
        },
      ],
    });
  },
};
