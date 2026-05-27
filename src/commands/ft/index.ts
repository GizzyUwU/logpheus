import path from "path";
import fs from "fs";
import type { SlackCommandMiddlewareArgs, App } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
const commandHandlers = new Map<string, { execute: Function }>();

const commandsDir = path.join(__dirname, "commands");
if (fs.existsSync(commandsDir)) {
  for (const file of fs.readdirSync(commandsDir)) {
    if (
      (!file.endsWith(".ts") && !file.endsWith(".js")) ||
      file.includes(".disabled.")
    )
      continue;
    const fileStem = file.replace(/\.(ts|js)$/, "").toLowerCase();
    const importFile = await import(path.join(commandsDir, file));
    const mod = importFile.default ?? importFile;
    if (typeof mod?.execute !== "function") continue;
    commandHandlers.set(fileStem, mod);
  }
}

async function setup(
  app: App,
  ctx: RequestHandler,
) {
  const viewsDir = path.join(__dirname, "views");
  if (!fs.existsSync(viewsDir)) return;

  for (const file of fs.readdirSync(viewsDir)) {
    if (
      (!file.endsWith(".ts") && !file.endsWith(".js")) ||
      file.includes(".disabled.")
    )
      continue;
    const fileStem = file.replace(/\.(ts|js)$/, "");
    const importFile = await import(path.join(viewsDir, file));
    const mod = importFile.default ?? importFile;
    if (typeof mod?.execute !== "function") continue;
    const callbackId = `${ctx.namespacedPrefix}_${fileStem}`;
    app.view(callbackId, async (args) => {
      await args.ack();
      try {
        await mod.execute(args, { ...ctx, callbackId } satisfies RequestHandler);
      } catch (err) {
        ctx.logger.error({ err });
      }
    });
    ctx.logger.info(`[Logpheus] Registered view (${ctx.folder}): ${file} → ${callbackId}`);
  }
}

export default {
  setup: async (app: App, ctx: RequestHandler) => setup(app, ctx),
  execute: async (args: SlackCommandMiddlewareArgs, ctx: RequestHandler) => {
    const [rawOption] = args.command.text.split(" ").filter(Boolean);
    if (!rawOption)
      return args.respond({
        text: "You must provide an option.",
        response_type: "ephemeral",
      });

    const option = rawOption.toLowerCase();
    const handler = commandHandlers.get(option);

    if (!handler)
      return args.respond({
        text: `Unknown option \`${option}\`. Check /${ctx.prefix} help to know the commands!`,
        response_type: "ephemeral",
      });

    await handler.execute(
      {
        ...args,
        command: {
          ...args.command,
          text: args.command.text.replace(rawOption, "").trim(),
        },
      },
      {
        ...ctx,
        callbackId: ctx.namespacedPrefix + "_" + option
      },
    );
  },
};
