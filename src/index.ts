import {
  App,
  LogLevel,
  type SlackCommandMiddlewareArgs,
  type SlackViewMiddlewareArgs,
} from "@slack/bolt";
import FT from "./lib/ft";
import fs from "fs";
import path from "path";
import checkAllProjects from "./handlers/checkForNewDevlogs";
import runMigrations from "./migrate";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as Sentry from "@sentry/bun";
import type { WebClient } from "@slack/web-api";
let sentryEnabled = false;
let prefix: string;
type DatabaseType =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });
const cacheDir = path.join(__dirname, "../cache");
let pg: DatabaseType;
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    release: process.env.SENTRY_NAME || "logpheus",
    integrations: [],
    tracesSampleRate: 0,
    sendDefaultPii: true,
  });
  sentryEnabled = true;
}

if (process.env.PGLITE === "false") {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({
    connectionString: process.env.DB_URL,
  });
  const db = drizzle({
    client: pool,
    casing: "snake_case",
  });
  pg = db;
  await migrate(db, {
    migrationsFolder: "./migrations",
  });
} else {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const pgClient = new PGlite(path.join(cacheDir, "pg"));
  const db = drizzle({
    client: pgClient,
    casing: "snake_case",
  });
  pg = db;
  await migrate(db, {
    migrationsFolder: "./migrations",
  });
}

const app = new App({
  signingSecret: process.env.SIGNING_SECRET,
  token: process.env.BOT_TOKEN,
  appToken: process.env.APP_TOKEN,
  socketMode: process.env.APP_TOKEN
    ? process.env.SOCKET_MODE === "true"
    : false,
  customRoutes: [
    {
      path: "/healthcheck",
      method: ["GET"],
      handler: (req, res) => {
        res.writeHead(200);
        res.end("I'm okay!");
      },
    },
  ],
});

let clients: Record<string, FT> = {};

export interface RequestHandler {
  pg: DatabaseType;
  client: WebClient;
  clients: Record<string, FT>;
  sentryEnabled: boolean;
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
  fs.readdirSync(folderPath).forEach((file) => {
    if (!file.endsWith(".ts") && !file.endsWith(".js")) return;
    const module = require(path.join(folderPath, file)).default;
    if (!module?.name || typeof module.execute !== "function") return;

    const suffix = type === "view" ? "_" + module.name : "-" + module.name;
    const callbackId = `${prefix}_${module.name}`;
    const format =
      type === "view" ? `${prefix}${suffix}` : `/${prefix}${suffix}`;
    const registerHandler = (id: string, mod: typeof module) => {
      (app[type as "view" | "command"] as Function)(
        format,
        async (args: SlackViewMiddlewareArgs | SlackCommandMiddlewareArgs) => {
          const run = async () => {
            await args.ack();
            await mod.execute(args, {
              pg,
              client: app.client,
              clients,
              sentryEnabled,
              Sentry,
              prefix,
              callbackId: id,
            } satisfies RequestHandler);
          };

          if (!sentryEnabled) {
            try {
              run();
            } catch (err) {
              console.error(`Error executing ${type} ${mod.name}:`, err);
            }
          } else {
            await Sentry.withScope(async (scope) => {
              scope.setContext("handler", {
                type,
                module: mod.name,
              });
              scope.setContext("slack", {
                user:
                  "user_id" in args.body
                    ? args.body.user_id
                    : args.body.user?.id,
                channel:
                  "channel_id" in args.body
                    ? args.body.channel_id
                    : (args.body.view.private_metadata.length > 0 ? JSON.parse(args.body.view.private_metadata) as {
                        channel: string;
                      } : { channel: "" }).channel,
                triggerId:
                  "trigger_id" in args.body ? args.body.trigger_id : "",
              });

              try {
                run();
              } catch (err) {
                Sentry.captureException(err);
              }
            });
          }
        },
      );
    };

    registerHandler(callbackId, module);
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
      const mod = require(path.join(handlerDir, file)).default;
      if (!mod?.name || typeof mod.execute !== "function") return;
      try {
        await mod.execute({
          pg,
          client: app.client,
          clients,
          sentryEnabled,
          Sentry,
        } satisfies RequestHandler);
      } catch (err) {
        if (sentryEnabled) {
          Sentry.setContext("data", {
            module: mod.name,
            file,
          });
          Sentry.captureException(err);
        } else {
          console.error(`Failed to run ${mod?.name} handler:`, err);
        }
      }
    } catch (err) {
      if (sentryEnabled) {
        Sentry.setContext("data", {
          file,
        });
        Sentry.captureException(err);
      } else {
        console.error(`Error running handler ${file}:`, err);
      }
    }
  }
}

(async () => {
  try {
    await runMigrations(pg);
    app.logger.setName("[Logpheus]");
    app.logger.setLevel("error" as LogLevel);
    const self = await app.client.auth.test();
    if (self.user_id === "U0A50Q9SYK1") {
      prefix = "devlpheus";
    } else if (self.user_id === "U0A5CFG4EAJ") {
      prefix = "logpheus";
    } else {
      if (!self.user || !self.user_id)
        throw new Error("No username or user id for prefix");
      prefix = self.user_id?.slice(-2).toLowerCase() + "-" + self.user;
    }
    if (process.env.SOCKET_MODE === "true" && process.env.APP_TOKEN) {
      await app.start();
      console.info("[Logpheus] Running as Socket Mode");
    } else {
      const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
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
    if (sentryEnabled) {
      Sentry.captureException(err);
    } else {
      console.error("Unable to start app:", err);
    }
  }
})();
