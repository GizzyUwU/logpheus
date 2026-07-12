import path from "path";
import fs from "fs";
import { users } from "@/schema/users";
import { eq } from "drizzle-orm";
import type { SlackCommandMiddlewareArgs, App } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { stripMrkdwn } from "@/lib/parseMarkdown";
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

async function setup(app: App, ctx: RequestHandler) {
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
      const userData = await ctx.pg
        .select()
        .from(users)
        .where(eq(users.userId, args.body.user.id))
        .limit(1);

      if (userData.length === 0 && !callbackId.includes("register"))
        return args.respond({
          text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${ctx.prefix} register`,
          response_type: "ephemeral",
        });

      if (ctx.opClient && !userData[0]?.optOuts?.includes("analytics")) {
        ctx.opClient.identify({
          profileId: args.body.user.id,
          firstName: args.body.user.name,
          properties: {
            friendlyName: "generic",
          },
        });
        ctx.opClient.track("commandViews", {
          view: callbackId,
        });
        ctx.opClient.clear();
      }

      try {
        await mod.execute(args, {
          ...ctx,
          callbackId,
        } satisfies RequestHandler);
      } catch (err) {
        ctx.logger.error({ err });
      }
    });
    ctx.logger.info(`Registered view (${ctx.folder}): ${file} → ${callbackId}`);
  }
}

export default {
  setup: async (app: App, ctx: RequestHandler) => setup(app, ctx),
  execute: async (args: SlackCommandMiddlewareArgs, ctx: RequestHandler) => {
    try {
      const channel = await ctx.client.conversations.info({
        channel: args.command.channel_id,
      });
      if (
        !channel ||
        !channel.channel ||
        Object.keys(channel).length === 0 ||
        !channel.ok
      )
        return await args.respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
      const [rawOption] = args.command.text.split(" ").filter(Boolean);
      const userData = await ctx.pg.query.users.findFirst({
        where: eq(users.userId, args.body.user_id),
        with: {
          ysws: true,
          projects: true,
        },
      });

      if ((!userData || Object.keys(userData).length === 0) && !rawOption?.includes("register"))
        return args.respond({
          text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${ctx.prefix} register`,
          response_type: "ephemeral",
        });

      if (!rawOption)
        return args.respond({
          text: "You must provide an option.",
          response_type: "ephemeral",
        });

      const option = stripMrkdwn(rawOption.toLowerCase());
      const handler = commandHandlers.get(option);

      if (!handler)
        return args.respond({
          text: `Unknown option \`${option}\`. Check /${ctx.prefix} help to know the commands!`,
          response_type: "ephemeral",
        });

      const loggerCTX = ctx.logger.with({
        command: ctx.prefix + " " + option,
      });

      if (ctx.opClient && !userData?.optOuts?.includes("analytics")) {
        ctx.opClient.identify({
          profileId: args.command.user_id,
          firstName: args.command.user_name,
          properties: {
            friendlyName: "generic",
            channelId: args.command.channel_id,
            channelName: args.command.channel_name,
          },
        });
        ctx.opClient.track("commands", {
          command: option,
        });
        ctx.opClient.clear();
      }

      await handler.execute(
        {
          ...args,
          command: {
            ...args.command,
            text: stripMrkdwn(args.command.text.replace(rawOption, "").trim()),
          },
        },
        {
          ...ctx,
          callbackId: ctx.namespacedPrefix + "_" + option,
          logger: loggerCTX,
          userData: userData,
          yswsAll: userData?.ysws ?? [],
          projects: userData?.projects ?? [],
        },
      );
    } catch (error: any) {
      if (
        error.code === "slack_webapi_platform_error" &&
        error.data?.error === "channel_not_found"
      ) {
        await args.respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
        return;
      } else {
        ctx.logger.error({ error });

        await args.respond({
          text: "An unexpected error occurred!",
          response_type: "ephemeral",
        });
      }
    }
  },
};
