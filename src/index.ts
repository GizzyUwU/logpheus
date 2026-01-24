import { App, LogLevel, type AckFn, type RespondArguments } from "@slack/bolt";
import FT from "./lib/ft";
import fs from "fs";
import path from "path";
import checkAllProjects from "./handlers/checkForNewDevlogs";
import { users } from "./schema/users";
import runMigrations from "./migrate";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as Sentry from "@sentry/bun";
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
  const pool = new Pool({
    connectionString: process.env.DB_URL,
  });
  pg = drizzle({
    client: pool,
    casing: "snake_case",
  });
} else {
  const { drizzle } = await import("drizzle-orm/pglite");
  const pgClient = new PGlite(path.join(cacheDir, "pg"));
  pg = drizzle({
    client: pgClient,
    casing: "snake_case",
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

function loadHandlers(app: App, folder: string, type: "command" | "view") {
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
        async (args: any) => {
          try {
            const ack: AckFn<string | RespondArguments> = args.ack;
            await ack();
            console.log(id);
            await mod.execute(args, {
              pg,
              clients,
              SentryEnabled: sentryEnabled,
              sentry: Sentry,
              callbackId: id,
            });
          } catch (err) {
            if (sentryEnabled) {
              Sentry.captureException(err, {
                extra: { type, module: mod.name },
              });
            } else {
              console.error(`Error executing ${type} ${mod.name}:`, err);
            }
          }
        },
      );
    };

    registerHandler(callbackId, module);
    console.log(`[Logpheus] Registered ${type}: ${module.name}`);
  });
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

    loadHandlers(app, "commands", "command");
    loadHandlers(app, "views", "view");
    console.log('[Logpheus] My prefix is', Bun.color("darkseagreen", "ansi") + prefix + "\x1b[0m" );

    checkAllProjects(app.client, clients, pg, sentryEnabled, Sentry);
    setInterval(() => {
      checkAllProjects(app.client, clients, pg, sentryEnabled, Sentry);
    }, 60 * 1000);
  } catch (err) {
    if (sentryEnabled) {
      Sentry.captureException(err);
    } else {
      console.error("Unable to start app:", err);
    }
  }
})();
