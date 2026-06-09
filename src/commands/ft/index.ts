import path from "path";
import fs from "fs";
import type { SlackCommandMiddlewareArgs, App } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { users } from "@/schema/users";
import { and, eq } from "drizzle-orm";
import { yswsUsers } from "@/schema/ysws";
import ysws from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
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

      if (userData.length === 0)
        return args.respond({
          text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${ctx.prefix} register`,
          response_type: "ephemeral",
        });

      const yswsData = await ctx.pg
        .select()
        .from(yswsUsers)
        .where(
          and(
            eq(yswsUsers.userId, args.body.user.id),
            eq(yswsUsers.yswsId, ysws.flavortown.id),
          ),
        )
        .limit(1);

      if (yswsData.length === 0 && !callbackId.includes("register"))
        return args.client.chat.postEphemeral({
          channel: JSON.parse(args.view.private_metadata).channel,
          user: args.body.user.id,
          text: `Hey! You aren't registered to this YSWS! Run /${ctx.prefix}-${ctx.folder} register`,
        });

      if (ctx.opClient && !userData[0]?.optOuts?.includes("analytics")) {
        ctx.opClient.identify({
          profileId: args.body.user.id,
          firstName: args.body.user.name,
          properties: {
            yswsId: yswsData[0]?.yswsId,
            friendlyName: ysws.flavortown.humanName,
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
          yswsData: yswsData[0]!,
          userData: userData[0]!,
          yswsId: Number(yswsData[0]?.yswsId)
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
    const [rawOption] = args.command.text.split(" ").filter(Boolean);
    const userData = await ctx.pg
      .select()
      .from(users)
      .where(eq(users.userId, args.command.user_id))
      .limit(1);

    if (userData.length === 0)
      return args.respond({
        text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${ctx.prefix} register`,
        response_type: "ephemeral",
      });

    const yswsData = await ctx.pg
      .select()
      .from(yswsUsers)
      .where(
        and(
          eq(yswsUsers.userId, args.command.user_id),
          eq(yswsUsers.yswsId, ysws.flavortown.id),
        ),
      )
      .limit(1);

    if (yswsData.length === 0 && rawOption !== "register")
      return args.respond({
        text: `Hey! You aren't registered to this YSWS! Run /${ctx.prefix}-${ctx.folder} register`,
        response_type: "ephemeral",
      });

    if (!rawOption)
      return args.respond({
        text: "You must provide an option.",
        response_type: "ephemeral",
      });

    const option = stripMrkdwn(rawOption);
    const handler = commandHandlers.get(option);

    if (!handler)
      return args.respond({
        text: `Unknown option \`${option}\`. Check /${ctx.prefix} help to know the commands!`,
        response_type: "ephemeral",
      });

    if (ctx.opClient && !userData[0]?.optOuts?.includes("analytics")) {
      ctx.opClient.identify({
        profileId: args.command.user_id,
        firstName: args.command.user_name,
        properties: {
          yswsId: yswsData[0]?.yswsId,
          channelId: args.command.channel_id,
          channelName: args.command.channel_name,
          friendlyName: ysws.flavortown.humanName,
        },
      });
      ctx.opClient.track("commands", {
        command: option,
      });
      ctx.opClient.clear();
    }

    const loggerCTX = ctx.logger.with({
      command: ctx.prefix + "-" + ctx.folder + " " + option,
    });

    let yswsClient =
      ctx.clients[`${yswsData[0]?.yswsId}:${yswsData[0]?.userId}`];
    if (rawOption !== "register" && !yswsClient) {
      const AdapterClass = await loadAdapter(ysws.flavortown.adapter);
      const adapter = new AdapterClass(yswsData[0]?.apiKey, loggerCTX);
      yswsClient = adapter;
      ctx.clients[`${yswsData[0]?.yswsId}:${yswsData[0]?.userId}`] = adapter;
    }

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
        logger: loggerCTX,
        callbackId: ctx.namespacedPrefix + "_" + option,
        yswsData: yswsData[0]!,
        userData: userData[0]!,
        yswsClient,
        yswsId: Number(yswsData[0]?.yswsId)
      } satisfies RequestHandler,
    );
  },
};
