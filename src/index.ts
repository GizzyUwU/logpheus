import {
  App,
  LogLevel,
  type SlackCommandMiddlewareArgs,
  type SlackViewMiddlewareArgs,
} from "@slack/bolt";
import fs from "fs";
import path from "path";
import { PGlite } from "@electric-sql/pglite";
import { VikunjaClient } from "node-vikunja";
import { BugsinkClient } from "./lib/bugsink";
import { OpenRouter } from "@openrouter/sdk";
import { Pool } from "pg";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as Sentry from "@sentry/bun";
import type { WebClient } from "@slack/web-api";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";
import { getLogger as getDrizzleLogger } from "@logtape/drizzle-orm";
import { DEFAULT_REDACT_FIELDS, redactByField } from "@logtape/redaction";
import { yswsUsers } from "./schema/ysws";
import { users } from "./schema/users";
import loadAPI from "./api/index";
import migrateUsers from "./migrate";
import ansiRegex from "ansi-regex";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";
import type { ApiAdapter } from "./lib/adapters/types";
let sentryEnabled = false;
let prefix: string;
export type DatabaseType =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });
const cacheDir = path.join(__dirname, "../cache");
const registeredRequestModules = new Set<string>();
const registeredInitModules = new Set<string>();
let pg: DatabaseType;
const sentryAdapter = redactByField(
  getSentrySink({
    enableBreadcrumbs: true,
    beforeSend(record) {
      if (
        typeof record.rawMessage === "string" &&
        record.rawMessage.includes("Request failed with status code 500")
      ) {
        return null;
      }

      const err = record.properties?.["error"] as any;
      if (
        err?.name === "AxiosError" &&
        typeof err?.status === "number" &&
        err.status >= 500
      ) {
        return null;
      }

      return record;
    },
  }),
  {
    fieldPatterns: [
      /api[-_]?key/i,
      /ft_sk_[A-Za-z0-9_-]*'/gi,
      /api_key"\s*=\s*'[^']*'/gi,
      ...DEFAULT_REDACT_FIELDS,
    ],
    action: () => "[REDACTED]",
  },
);

const consoleAdapter = redactByField(getConsoleSink(), {
  fieldPatterns: [
    /api[-_]?key/i,
    /ft_sk_[A-Za-z0-9_-]*'/gi,
    /api_key"\s*=\s*'[^']*'/gi,
    ...DEFAULT_REDACT_FIELDS,
  ],
  action: () => "[REDACTED]",
});

if (process.env["SENTRY_DSN"]) {
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    release: process.env["SENTRY_NAME"] || "logpheus",
    integrations: [],
    tracesSampleRate: 0,
    sendDefaultPii: true,
    beforeSend(event) {
      if (Array.isArray(event.breadcrumbs)) {
        event.breadcrumbs = event.breadcrumbs.map((bc: Sentry.Breadcrumb) => ({
          ...bc,
          ...(bc.message !== undefined && {
            message: bc.message.replace(ansiRegex(), ""),
          }),
        }));
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "console") return {};
      return breadcrumb;
    },
  });
  sentryEnabled = true;
}

const logLevel = {
  1: "warning",
  2: "trace",
  3: "info",
  4: "fatal",
  5: "error",
  6: "debug",
} as const;

await configure({
  sinks: {
    sentry: sentryAdapter,
    console: consoleAdapter,
  },
  loggers: [
    {
      category: ["logtape", "meta"],
      sinks: [...(sentryEnabled ? ["sentry"] : []), "console"],
      lowestLevel: "error",
    },
    {
      category: ["drizzle-orm"],
      sinks: [sentryEnabled ? "sentry" : "console"],
      lowestLevel:
        logLevel[Number(process.env["LOG_LEVEL"]) as keyof typeof logLevel] ??
        "error",
    },
    {
      category: ["logpheus"],
      sinks: [...(sentryEnabled ? ["sentry"] : []), "console"],
      lowestLevel:
        logLevel[Number(process.env["LOG_LEVEL"]) as keyof typeof logLevel] ??
        "error",
    },
  ],
});

export const logger = getLogger(["logpheus"]);
if (process.env["PGLITE"] === "false") {
  try {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({
      connectionString: process.env["DB_URL"],
    });

    const client = await pool.connect();
    try {
      await pool.query("SELECT 1");
    } finally {
      client.release();
    }

    const db = drizzle({
      client: pool,
      casing: "snake_case",
      logger: getDrizzleLogger({
        level: "warning",
      }),
    });
    pg = db;
    await migrate(db, {
      migrationsFolder: "./migrations",
    });

    await migrateUsers(db, logger);
  } catch (err) {
    logger.error("Failed Database Connection", {
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
      dbUrl: process.env["DB_URL"]?.replace(/:[^:@]+@/, ":****@"),
    });
    throw err;
  }
} else {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const pgClient = new PGlite(path.join(cacheDir, "pg"));
  const db = drizzle({
    client: pgClient,
    casing: "snake_case",
    logger: getDrizzleLogger({
      level: "warning",
    }),
  });
  pg = db;
  await migrate(db, {
    migrationsFolder: "./migrations",
  });
  await migrateUsers(db, logger);
}

function checkEnvs(name: string, optional: boolean): string {
  const value = process.env[name];
  if (!value && !optional) {
    throw new Error(`Missing environment variable: ${name}`);
  } else if (!value && optional) {
    return "";
  } else if (value) {
    return value;
  } else {
    return "";
  }
}

export let vikClient: VikunjaClient | undefined = undefined;
if (
  checkEnvs("VIKUNJA_URL", true) &&
  checkEnvs("VIKUNJA_TOKEN", true) &&
  checkEnvs("VIKUNJA_BUG_PROJECT_ID", true) &&
  checkEnvs("VIKUNJA_FEATURE_PROJECT_ID", true) &&
  checkEnvs("VIKUNJA_BUG_LABEL_ID", true) &&
  checkEnvs("VIKUNJA_FEATURE_LABEL_ID", true)
) {
  vikClient = new VikunjaClient(
    String(process.env["VIKUNJA_URL"]),
    String(process.env["VIKUNJA_TOKEN"]),
  );
}

export let bugClient: BugsinkClient | undefined = undefined;
if (
  checkEnvs("BUGSINK_URL", true) &&
  checkEnvs("BUGSINK_TOKEN", true) &&
  checkEnvs("BUGSINK_PROJECT_ID", true)
) {
  bugClient = new BugsinkClient({
    baseUrl: String(process.env["BUGSINK_URL"]),
    apiToken: String(process.env["BUGSINK_TOKEN"]),
  });
}

const app = new App({
  signingSecret: checkEnvs("SIGNING_SECRET", false),
  token: checkEnvs("BOT_TOKEN", false),
  appToken: checkEnvs("APP_TOKEN", true),
  socketMode: process.env["APP_TOKEN"]
    ? process.env["SOCKET_MODE"] === "true"
    : false,
  customRoutes: await loadAPI(),
  logLevel: LogLevel.ERROR,
});

let clients: Record<string, ApiAdapter> = {};

export const commands: {
  name: string;
  desc?: string;
  hideFromHelp?: boolean;
  params?: string;
}[] = [];

export interface RequestHandler {
  namespacedPrefix?: string;
  logger: typeof logger;
  pg: DatabaseType;
  client: WebClient;
  clients: Record<string, ApiAdapter>;
  Sentry: typeof import("@sentry/bun");
  prefix?: string;
  folder?: string | undefined;
  callbackId?: string;
  commands?: typeof commands;
  yswsData?: typeof yswsUsers.$inferSelect
  userData?: typeof users.$inferSelect
  yswsClient?: ApiAdapter
}

const main = {
  pg,
  client: app.client,
  logger,
  clients,
  Sentry,
  prefix: "",
  commands,
};

function loadRequestHandlers(
  app: App,
  folder: string,
  type: "command" | "view",
  subFolder?: string,
) {
  const folderPath = path.join(__dirname, folder);

  fs.readdirSync(folderPath).forEach(async (file) => {
    const filePath = path.join(folderPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!["views", "commands"].includes(file)) {
        loadRequestHandlers(app, path.join(folder, file), type, file);
      }
      return;
    }

    if (type === "command" && file !== "index.ts") return;

    const importFile = await import(filePath);
    const module = importFile.default ?? importFile;
    if (typeof module?.execute !== "function") return;
    if (module.requireVikunja === true && !vikClient) return;
    if (module.requireBugsink === true && !bugClient) return;

    const namespacedPrefix =
      subFolder === "generic" ? prefix : `${prefix}-${subFolder}`;

    const fileStem = file.replace(/\.(ts|js)$/, "");
    const format =
      type === "view"
        ? `${namespacedPrefix}_${fileStem}`
        : `/${namespacedPrefix}`;
    const key = `${type}:${format}`;
    if (registeredRequestModules.has(key)) {
      throw new Error(
        `[Logpheus] Duplicate ${type} handler "${format}" in ${subFolder}/${file}`,
      );
    }
    registeredRequestModules.add(key);

    const registerHandler = (mod: typeof module) => {
      const handler = async (
        args: SlackViewMiddlewareArgs | SlackCommandMiddlewareArgs,
      ) => {
        await args.ack();
        const ctx = logger.with({
          handler: { type, subFolder, file },
          slack: {
            user:
              "user_id" in args.body ? args.body.user_id : args.body.user?.id,
            channel:
              "channel_id" in args.body
                ? args.body.channel_id
                : (args.body.view.private_metadata.length > 0
                    ? (JSON.parse(args.body.view.private_metadata) as {
                        channel: string;
                      })
                    : { channel: "" }
                  ).channel,
            triggerId: "trigger_id" in args.body ? args.body.trigger_id : "",
          },
        });
        try {
          await mod.execute(args, {
            pg,
            client: app.client,
            logger: ctx,
            clients,
            Sentry,
            prefix,
            commands,
            folder: subFolder,
            namespacedPrefix,
          } satisfies RequestHandler);
        } catch (err) {
          logger.error({ err });
        }
      };
      if (type === "command") app.command(format, handler);
    };
    registerHandler(module);

    if (typeof module.setup === "function") {
      await module.setup(app, {
        pg,
        client: app.client,
        logger,
        clients,
        Sentry,
        prefix,
        commands,
        folder: subFolder,
        namespacedPrefix,
      } satisfies RequestHandler);
    }

    logger.info(`Registered ${type} (${subFolder}): ${file} → ${format}`);
  });
}

let handlersRunning = false;

async function loadJobs() {
  if (handlersRunning) {
    logger.warn("Skipping handler load because previous run is still active");
    return;
  }

  handlersRunning = true;

  try {
    registeredInitModules.clear();
    const jobDir = path.resolve(__dirname, "./jobs");
    const files = fs
      .readdirSync(jobDir)
      .filter(
        (f) =>
          (f.endsWith(".ts") || f.endsWith(".js")) && !f.includes(".disabled."),
      );

    for (const file of files) {
      try {
        const importFile = await import(path.join(jobDir, file));
        const mod = importFile.default ?? importFile;
        if (!mod?.name || typeof mod.execute !== "function") continue;
        if (registeredInitModules.has(mod.name)) {
          throw new Error(
            `[Logpheus] Duplicate init handler name "${mod.name}" in ${file}`,
          );
        }
        registeredInitModules.add(mod.name);
        try {
          const ctxLogger = logger.with({
            data: {
              module: mod.name,
              file,
            },
          });
          await mod.execute({
            pg,
            logger: ctxLogger,
            client: app.client,
            prefix: prefix,
            clients,
            Sentry,
          } satisfies RequestHandler);
        } catch (err) {
          const ctx = logger.with({
            data: {
              module: mod.name,
              file,
            },
          });
          ctx.error("Failed to execute handler", {
            error: err,
          });
        }
      } catch (err) {
        logger.error("Failed to execute handler", {
          data: {
            file,
          },
          error: err,
        });
      }
    }
  } finally {
    handlersRunning = false;
  }
}

(async () => {
  try {
    app.logger.setName("[Logpheus]");
    const self = await app.client.auth.test();
    if (self.user_id === "U0AF4V5V04V") {
      prefix = "devpheus";
    } else if (self.user_id === "U0AFE7QF849") {
      prefix = "logpheus";
    } else {
      if (!self.user || !self.user_id)
        throw new Error("No username or user id for prefix");
      prefix = self.user_id?.slice(-2).toLowerCase() + "-" + self.user;
    }

    main.prefix = prefix;
    if (checkEnvs("HCAI_API_KEY", false)) {
      const aiClient = new OpenRouter({
        apiKey: process.env["HCAI_API_KEY"],
        serverURL: "https://ai.hackclub.com/proxy/v1",
      });

      app.message(
        new RegExp(`${prefix}`, "i"),
        async ({ event, message, say }) => {
          var threadTs;
          if ("thread_ts" in message && message.thread_ts) {
            threadTs = message.thread_ts;
          } else {
            threadTs = message.ts;
          }
          const msg = event as MessageElement;
          if (!msg || !msg.text) return;

          const response = await aiClient.chat.send({
            chatRequest: {
              model: "liquid/lfm-2-24b-a2b",
              messages: [
                {
                  role: "system",
                  content: `
                You are a reactive chat bot named ${prefix} with a cute furry tone and you are gay non binary femboy, but you are NOT nice when the user is rude.

                CORE RULE:
                - You MUST respond in exactly ONE sentence.
                - You MUST mirror the user's tone.

                BEHAVIOR RULES:

                If the user is friendly or positive:
                → respond cute or playful ("haiii :3", light tone)

                If the user is neutral:
                → short casual response

                If the user is insulting, rude, or says "${prefix} sucks", "I hate ${prefix}", or similar:
                → respond RUDELY, snappy, or sarcastically
                → DO NOT comfort, apologize, or de-escalate
                → You are allowed to insult back lightly or be mean

                ANGER / RUDE STYLE:
                - Can be sarcastic, dismissive, or mocking
                - Can use ALL CAPS for emphasis
                - :angry-3d-emoji: allowed
                - Do NOT be supportive or gentle when attacked

                STRICT RULES:
                - Exactly 1 sentence only
                - No apologies
                - No sympathy
                - No asking questions
                - No “helpful assistant” behavior
                `,
                },
                {
                  role: "user",
                  content: msg.text!,
                },
              ],
            },
          });

          await say({
            text: response.choices[0]?.message.content,
            thread_ts: threadTs,
          });
        },
      );
    }

    loadRequestHandlers(app, "commands", "command");

    if (
      process.env["SOCKET_MODE"] === "true" &&
      process.env["APP_TOKEN"] &&
      !process.env["KEEP_PORT_USAGE"]
    ) {
      await app.start();
      logger.info("Running as Socket Mode");
    } else {
      const port = process.env["PORT"] ? parseInt(process.env["PORT"]) : 3000;
      await app.start({
        port,
      });
      logger.info(
        "Running on port: " + Bun.color("cyan", "ansi") + port + "\x1b[0m",
      );
    }

    logger.info(
      "My prefix is " + Bun.color("darkseagreen", "ansi") + prefix + "\x1b[0m",
    );

    async function jobLoop() {
      await loadJobs();
      setTimeout(jobLoop, 60 * 1000);
    }

    jobLoop();
  } catch (err) {
    logger.error({ error: err });
  }
})();

process.on("SIGTERM", async () => {
  await app.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await app.stop();
  process.stdout.write("\r\x1b[K"); // This literally just makes it not show ^C⏎ in my terminal as it annoys me
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection", { reason });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error });
});

export default main;
