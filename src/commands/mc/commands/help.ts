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

export default {
  name: "help",
  hideFromHelp: true,
  execute: async (
    { respond }: SlackCommandMiddlewareArgs,
    { prefix, folder }: RequestHandler,
  ) => {
    const commands = await getCommands();
    const helpText = commands
      .filter((cmd) => !cmd.hideFromHelp)
      .map(
        (cmd) =>
          `• */${prefix}-${folder} ${cmd.name}* ${cmd.params} — ${cmd.desc}`,
      )
      .join("\n");

    return respond({
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text:
              (/^[a-z]/i.test(prefix!)
                ? prefix![0]!.toUpperCase() + prefix!.slice(1)
                : prefix!) + `'s ${folder} commands!`,
            emoji: true,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: helpText || "No commands available.",
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "Logpheus offically condones the projects <https://macondo.hackclub.com/projects/5820|Macondo Utils> and <https://macondo.hackclub.com/projects/349|Macondo+>!",
            },
          ],
        },
      ],
      response_type: "ephemeral",
    });
  },
};