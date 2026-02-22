import {
  App,
  LogLevel,
  type SlackCommandMiddlewareArgs,
  type SlackViewMiddlewareArgs,
} from "@slack/bolt";
import FT from "./lib/ft";
import fs from "fs";
import path from "path";
import runMigrations from "./migrate";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as Sentry from "@sentry/bun";
import type { WebClient } from "@slack/web-api";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";
import { getLogger as getDrizzleLogger } from "@logtape/drizzle-orm";
import { DEFAULT_REDACT_FIELDS, redactByField } from "@logtape/redaction";
let sentryEnabled = false;
let prefix: string;
type DatabaseType =
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
  });
  sentryEnabled = true;
}

await configure({
  sinks: {
    sentry: sentryAdapter,
    console: consoleAdapter,
  },
  loggers: [
    { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "error" },
    {
      category: ["drizzle-orm"],
      sinks: [sentryEnabled ? "sentry" : "console"],
      lowestLevel: "warning",
    },
    {
      category: ["logpheus"],
      sinks: [sentryEnabled ? "sentry" : "console"],
      lowestLevel: "warning",
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

const app = new App({
  signingSecret: checkEnvs("SIGNING_SECRET", false),
  token: checkEnvs("BOT_TOKEN", false),
  appToken: checkEnvs("APP_TOKEN", true),
  socketMode: process.env["APP_TOKEN"]
    ? process.env["SOCKET_MODE"] === "true"
    : false,
  customRoutes: [
    {
      path: "/healthcheck",
      method: ["GET"],
      handler: (_, res) => {
        res.writeHead(200);
        res.end("I'm okay!");
      },
    },
  ],
});

let clients: Record<string, FT> = {};

export interface RequestHandler {
  logger: typeof logger;
  pg: DatabaseType;
  client: WebClient;
  clients: Record<string, FT>;
  Sentry: typeof import("@sentry/bun");
  prefix?: string;
  callbackId?: string;
}

function loadRequestHandlers(
  app: App,
  folder: string,
  type: "command" | "view",
) {
  const folderPath = path.join(__dirname, folder);
  fs.readdirSync(folderPath).forEach(async (file) => {
    if (!file.endsWith(".ts") && !file.endsWith(".js")) return;
    const importFile = await import(path.join(folderPath, file));
    const module = importFile.default ?? importFile;
    if (!module?.name || typeof module.execute !== "function") return;
    const key = `${type}:${module.name}`;
    if (registeredRequestModules.has(key)) {
      throw new Error(
        `[Logpheus] Duplicate ${type} handler name "${module.name}" in ${file}`,
      );
    }
    registeredRequestModules.add(key);
    const suffix = type === "view" ? "_" + module.name : "-" + module.name;
    const callbackId = `${prefix}_${module.name}`;
    const format =
      type === "view" ? `${prefix}${suffix}` : `/${prefix}${suffix}`;
    const registerHandler = (mod: typeof module) => {
      (app[type as "view" | "command"] as Function)(
        format,
        async (args: SlackViewMiddlewareArgs | SlackCommandMiddlewareArgs) => {
          await args.ack();
          const run = async (ctx?: typeof logger) => {
            await mod.execute(args, {
              pg,
              client: app.client,
              logger: ctx ? ctx : logger,
              clients,
              Sentry,
              prefix,
              callbackId,
            } satisfies RequestHandler);
          };

          const ctx = logger.with({
            handler: {
              type,
              module: mod.name,
            },
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
            run(ctx);
          } catch (err) {
            logger.error({
              err,
            });
          }
        },
      );
    };

    registerHandler(module);
    console.log(`[Logpheus] Registered ${type}: ${module.name}`);
  });
}

async function loadHandlers() {
  const handlerDir = path.resolve(__dirname, "./handlers");
  const files = fs
    .readdirSync(handlerDir)
    .filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of files) {
    try {
      const importFile = await import(path.join(handlerDir, file));
      const mod = importFile.default ?? importFile;
      if (!mod?.name || typeof mod.execute !== "function") return;
      if (registeredInitModules.has(mod.name)) {
        throw new Error(
          `[Logpheus] Duplicate init handler name "${mod.name}" in ${file}`,
        );
      }
      registeredInitModules.add(mod.name);
      try {
        await mod.execute({
          pg,
          logger,
          client: app.client,
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
}

(async () => {
  try {
    await runMigrations(pg);
    app.logger.setName("[Logpheus]");
    app.logger.setLevel("error" as LogLevel);
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
    if (process.env["SOCKET_MODE"] === "true" && process.env["APP_TOKEN"]) {
      await app.start();
      console.info("[Logpheus] Running as Socket Mode");
    } else {
      const port = process.env["PORT"] ? parseInt(process.env["PORT"]) : 3000;
      await app.start(port);
      console.info("[Logpheus] Running on port:", port);
    }

    loadRequestHandlers(app, "commands", "command");
    loadRequestHandlers(app, "views", "view");
    console.log(
      "[Logpheus] My prefix is",
      Bun.color("darkseagreen", "ansi") + prefix + "\x1b[0m",
    );

    loadHandlers();
    setInterval(loadHandlers, 60 * 1000);
  } catch (err) {
    logger.error({ error: err });
  }
})();

process.on("SIGTERM", async () => {
  await app.stop();
  process.exit(0);
});
