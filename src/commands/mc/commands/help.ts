import path from "path";
import fs from "fs";
import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
interface CommandMeta {
  name: string;
  params?: string;
  desc?: string;
  hideFromHelp: boolean;
}

let scannedCommands: CommandMeta[] | null = null;
async function getCommands(): Promise<CommandMeta[]> {
  if (scannedCommands) return scannedCommands;
  scannedCommands = [];

  for (const file of fs.readdirSync(__dirname)) {
    if (
      (!file.endsWith(".ts") && !file.endsWith(".js")) ||
      file.includes(".disabled.") ||
      file === "index.ts" ||
      file === "index.js"
    )
      continue;

    const importFile = await import(path.join(__dirname, file));
    const mod = importFile.default ?? importFile;
    if (!mod?.name) continue;

    scannedCommands.push({
      name: mod.name,
      params: mod.params ?? "",
      desc: mod.desc ?? "No description",
      hideFromHelp: mod.hideFromHelp ?? false,
    });
  }

  return scannedCommands;
}

function paginateLines(lines: string[]): string[] {
  const pages: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current ? current + "\n" + line : line;
    if (next.length > 2800) {
      pages.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) pages.push(current);
  return pages;
}

export default {
  name: "help",
  params: "[page]",
  hideFromHelp: true,
  execute: async (
    { respond, command }: SlackCommandMiddlewareArgs,
    { prefix, folder }: RequestHandler,
  ) => {
    const commands = await getCommands();
    const lines = commands
      .filter(
        (cmd) =>
          !cmd.hideFromHelp
      )
      .map((cmd) => {
        const cmdPrefix = `${prefix}-${folder}`;
        return `• */${cmdPrefix} ${cmd.name}* ${cmd.params ?? ""} — ${cmd.desc ?? "No description"}`;
      });

    const pages = paginateLines(lines);
    const totalPages = Math.max(pages.length, 1);

    const requestedPage = parseInt(command.text.trim(), 10);
    const page = Number.isNaN(requestedPage)
      ? 1
      : Math.min(Math.max(requestedPage, 1), totalPages);

    const pageText = pages[page - 1] ?? "No commands available.";

    const titlePrefix = /^[a-z]/i.test(prefix!)
      ? prefix![0]!.toUpperCase() + prefix!.slice(1)
      : prefix!;

    return respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${titlePrefix}'s commands! (page ${page}/${totalPages})`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: pageText },
        },
        ...(totalPages > 1
          ? [
              {
                type: "context" as const,
                elements: [
                  {
                    type: "mrkdwn" as const,
                    text: `Use \`/${prefix} help <page>\` to see other pages.`,
                  },
                ],
              },
            ]
          : []),
      ],
      response_type: "ephemeral",
    });
  },
};