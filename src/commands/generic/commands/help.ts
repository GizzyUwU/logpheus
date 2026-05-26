import path from "path";
import fs from "fs";
import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";

interface CommandMeta {
  name: string;
  folder: string;
  params?: string;
  desc?: string;
  hideFromHelp: boolean;
  admin: boolean;
}

let scannedCommands: CommandMeta[] | null = null;

async function getCommands(): Promise<CommandMeta[]> {
  if (scannedCommands) return scannedCommands;
  scannedCommands = [];
  const commandsRoot = path.join(__dirname, "..", "..");

  for (const folder of fs.readdirSync(commandsRoot)) {
    const folderPath = path.join(commandsRoot, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;

    const commandsDir = path.join(folderPath, "commands");
    if (!fs.existsSync(commandsDir)) continue;

    for (const file of fs.readdirSync(commandsDir)) {
      if (
        (!file.endsWith(".ts") && !file.endsWith(".js")) ||
        file.includes(".disabled.") ||
        file === "index.ts" ||
        file === "index.js"
      )
        continue;

      const importFile = await import(path.join(commandsDir, file));
      const mod = importFile.default ?? importFile;
      if (!mod?.name) continue;

      scannedCommands.push({
        name: mod.name,
        folder,
        params: mod.params ?? "",
        desc: mod.desc ?? "No description",
        hideFromHelp: mod.hideFromHelp ?? false,
        admin: folder === "admin" ? true : false
      });
    }
  }

  return scannedCommands;
}

export default {
  name: "help",
  hideFromHelp: true,
  execute: async (
    { respond, command }: SlackCommandMiddlewareArgs,
    { prefix }: RequestHandler,
  ) => {
    const commands = await getCommands();
    const admins = process.env["ADMINS"]?.split(",") ?? [];
    
    const helpText = commands
      .filter((cmd) => !cmd.hideFromHelp && (cmd.folder !== "admin" ||  admins.includes(command.user_id)))
      .map((cmd) => {
        const cmdPrefix =
          cmd.folder === "generic" ? prefix : `${prefix}-${cmd.folder}`;
        return `• */${cmdPrefix} ${cmd.name}* ${cmd.params} — ${cmd.desc}`;
      })
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
                : prefix!) + "'s commands!",
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
              text: "Logpheus offically condones the projects <https://flavortown.hackclub.com/projects/135|Flavortown Utils> and <https://flavortown.hackclub.com/projects/140|Spicetown> with both having Logpheus integration for goals!",
            },
          ],
        },
      ],
      response_type: "ephemeral",
    });
  },
};