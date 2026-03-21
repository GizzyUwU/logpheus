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
import { VikunjaClient } from "node-vikunja";
import { Pool } from "pg";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as Sentry from "@sentry/bun";
import type { WebClient } from "@slack/web-api";
import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";
import { getLogger as getDrizzleLogger } from "@logtape/drizzle-orm";
import { DEFAULT_REDACT_FIELDS, redactByField } from "@logtape/redaction";
import checkAPIKey from "./lib/apiKeyCheck";
import { users } from "./schema/users";
import { eq } from "drizzle-orm";
import { getGenericErrorMessage } from "./lib/genericError";
import { createDocument } from "zod-openapi";
import openapiSpecification from "./oapiDocument";
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

export let vikClient: VikunjaClient | undefined = undefined;
if (checkEnvs("VIKUNJA_URL", true) && 
  checkEnvs("VIKUNJA_TOKEN", true) && 
  checkEnvs("VIKUNJA_BUG_PROJECT_ID", true) && 
  checkEnvs("VIKUNJA_FEATURE_PROJECT_ID", true) &&
  checkEnvs("VIKUNJA_BUG_LABEL_ID", true) &&
  checkEnvs("VIKUNJA_FEATURE_LABEL_ID", true)
) {
  vikClient = new VikunjaClient(String(process.env["VIKUNJA_URL"]), String(process.env["VIKUNJA_TOKEN"]));
}

const document = createDocument(openapiSpecification);

async function readJson<T>(req: any): Promise<T | null> {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return null;
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
        res.end("I'm ogay!");
      },
    },
    {
      path: "/api/v1/docs",
      method: ["GET"],
      handler: async (req, res) => {
        const url = req.url as string;

        if (url.endsWith("/openapi.json")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(document));
          return;
        }

        const html = Bun.file("src/swagger.html");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(await html.text());
      },
    },
    {
      path: "/api/v1/docs/:asset",
      method: ["GET"],
      handler: async (req, res) => {
        const url = req.url as string;
        if (url.endsWith("/openapi.json")) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(document));
          return;
        } else {
          res.writeHead(404);
          res.end();
          return;
        }
      },
    },
    {
      path: "/api/v1/goals",
      method: ["GET", "POST", "PUT", "DELETE"],
      handler: async (req, res) => {
        try {
          const preReplaceAPIKey = req.headers["authorization"];
          if (!preReplaceAPIKey?.startsWith("Bearer ")) {
            res.writeHead(401);
            res.end("Failed authentication, please provide your api key.");
            return;
          }

          const checkKey = preReplaceAPIKey.replace(/^Bearer\s+/i, "");
          const working = await checkAPIKey({
            db: pg,
            apiKey: checkKey,
            logger,
          });
          if (!working.works) {
            res.writeHead(401);
            res.end(
              "Failed authentication check! Check if the api key is correct and you are registered to logpheus.",
            );
            return;
          }

          const apiKey = checkKey!;
          switch (req.method) {
            case "POST": {
              const body = await readJson<{ goals: number[] }>(req);
              const goals = body?.goals ?? [];
              if (goals.length === 0) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ goals: [] }));
                return;
              }

              let ftClient: FT | undefined = clients[apiKey];
              if (!ftClient) {
                ftClient = new FT(apiKey, logger);
              }
              const shop = await ftClient.shop();
              if (!shop || !shop.status) {
                res.writeHead(500, {
                  "content-type": "application/json",
                });
                res.end(
                  JSON.stringify({
                    msg: "Unexpected error has occurred",
                  }),
                );
                return;
              }

              if (!shop.ok || !shop.data?.length) {
                switch (shop.status) {
                  default:
                    const msg = getGenericErrorMessage(shop.status, prefix!);
                    res.writeHead(shop.status, {
                      "content-type": "application/json",
                    });
                    res.end(
                      JSON.stringify({
                        msg: msg ?? "Unexpected error has occurred ",
                      }),
                    );
                    return;
                }
              }

              const validGoalIds = goals.filter((id) =>
                shop.data.some((item) => item.id === id),
              );

              if (validGoalIds.length === 0) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ goals: [] }));
                return;
              }

              let metaArr = working.row![0]?.meta ?? [];
              metaArr = metaArr.filter((item) => !item.startsWith("Goals::"));
              metaArr.push("Goals::[" + goals.join(",") + "]");

              await pg
                .update(users)
                .set({
                  meta: metaArr,
                })
                .where(eq(users.apiKey, apiKey));

              res.writeHead(200, {
                "content-type": "application/json",
              });

              res.end(JSON.stringify({ goals }));
              return;
            }

            case "PUT": {
              const body = await readJson<{ goals: number[] }>(req);
              const goals = body?.goals ?? [];
              if (goals.length === 0) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ goals: [] }));
                return;
              }

              let ftClient: FT | undefined = clients[apiKey];
              if (!ftClient) {
                ftClient = new FT(apiKey, logger);
              }
              const shop = await ftClient.shop();
              if (!shop || !shop.status) {
                res.writeHead(500, {
                  "content-type": "application/json",
                });
                res.end(
                  JSON.stringify({
                    msg: "Unexpected error has occurred",
                  }),
                );
                return;
              }

              if (!shop.ok || !shop.data?.length) {
                switch (shop.status) {
                  default:
                    const msg = getGenericErrorMessage(shop.status, prefix!);
                    res.writeHead(shop.status, {
                      "content-type": "application/json",
                    });
                    res.end(
                      JSON.stringify({
                        msg: msg ?? "Unexpected error has occurred ",
                      }),
                    );
                    return;
                }
              }

              const validGoalIds = goals.filter((id) =>
                shop.data.some((item) => item.id === id),
              );

              if (validGoalIds.length === 0) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ goals: [] }));
                return;
              }

              let metaArr = working.row![0]?.meta ?? [];
              const existGoals = metaArr.find((item) =>
                item.startsWith("Goals::"),
              );

              let mergedGoals: number[] = [];
              if (!existGoals) {
                mergedGoals = goals;
              } else {
                const match = existGoals.match(/\[(.*?)\]/);
                const parsedGoals = match?.[1]
                  ? match[1]
                    .split(",")
                    .map((v) => parseInt(v.trim()))
                    .filter((v) => !isNaN(v))
                  : [];

                mergedGoals = Array.from(new Set([...parsedGoals, ...goals]));
              }
              metaArr = metaArr.filter((item) => !item.startsWith("Goals::"));
              metaArr.push("Goals::[" + mergedGoals.join(",") + "]");

              await pg
                .update(users)
                .set({
                  meta: metaArr,
                })
                .where(eq(users.apiKey, apiKey));

              res.writeHead(200, {
                "content-type": "application/json",
              });

              res.end(JSON.stringify({ goals: mergedGoals }));
              return;
            }

            case "DELETE": {
              const body = await readJson<{ goals: number[] }>(req);
              const goals = body?.goals ?? [];
              if (goals.length === 0) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ goals: [] }));
                return;
              }
              let metaArr = working.row![0]?.meta ?? [];
              const existGoalsStr = metaArr.find((item) =>
                item.startsWith("Goals::"),
              );

              if (!existGoalsStr) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ goals: [] }));
                return;
              }

              const match = existGoalsStr.match(/\[(.*?)\]/);
              const parsedGoals = match?.[1]
                ? match[1]
                  .split(",")
                  .map((v) => parseInt(v.trim()))
                  .filter((v) => !isNaN(v))
                : [];

              const remainingGoals = parsedGoals.filter(
                (id) => !goals.includes(id),
              );

              if (remainingGoals.length === parsedGoals.length) {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ goals: remainingGoals }));
                return;
              }

              metaArr = metaArr.filter((item) => !item.startsWith("Goals::["));
              if (remainingGoals.length > 0) {
                metaArr.push(`Goals::[${remainingGoals.join(",")}]`);
              }

              await pg
                .update(users)
                .set({ meta: metaArr })
                .where(eq(users.apiKey, apiKey));

              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ goals: remainingGoals }));
              return;
            }

            default: {
              let metaArr = working.row![0]?.meta ?? [];
              const goalsRaw = metaArr.find((item) =>
                item.startsWith("Goals::"),
              );
              if (!goalsRaw) {
                res.writeHead(200, {
                  "content-type": "application/json",
                });
                res.end(
                  JSON.stringify({
                    goals: [],
                  }),
                );
                return;
              }
              const match = goalsRaw.match(/\[(.*?)\]/);
              const goals = match?.[1]
                ? match[1]
                  .split(",")
                  .map((v) => parseInt(v.trim()))
                  .filter((v) => !isNaN(v))
                : [];

              res.writeHead(200, {
                "content-type": "application/json",
              });

              res.end(JSON.stringify({ goals }));
              return;
            }
          }
        } catch (err) {
          const ctx = logger.with({
            error: err,
            method: req.method,
            endpoint: req.url,
          });

          ctx.error("Unexpected error has occured with the API");
          res.writeHead(500, {
            "content-type": "application/json",
          });

          res.end(JSON.stringify({ msg: "Internal server error" }));
        }
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

export const commands: {
  name: string;
  desc?: string;
  hideFromHelp?: boolean;
  params?: string;
}[] = [];

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
    if (module.requireVikunja === true && !vikClient) return;
    if (type === "command") {
      commands.push({
        name: module.name,
        desc: module.desc ?? "No description",
        params: module.params ?? "",
        hideFromHelp: module.hideFromHelp ?? false,
      });
    }
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
      const handler = async (
        args: SlackViewMiddlewareArgs | SlackCommandMiddlewareArgs,
      ) => {
        await args.ack();

        const ctx = logger.with({
          handler: {
            type,
            module: mod.name,
            file,
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
          await mod.execute(args, {
            pg,
            client: app.client,
            logger: ctx,
            clients,
            Sentry,
            prefix,
            callbackId,
          } satisfies RequestHandler);
        } catch (err) {
          logger.error({
            err,
          });
        }
      };
      if (type === "command") {
        app.command(format, handler);
      } else {
        app.view(format, handler);
      }
    };

    registerHandler(module);
    console.log(`[Logpheus] Registered ${type}: ${module.name}, ${format}`);
  });
}

let handlersRunning = false;

async function loadHandlers() {
  if (handlersRunning) {
    logger.warn(
      "[Logpheus] Skipping handler load because previous run is still active",
    );
    return;
  }

  handlersRunning = true;

  try {
    registeredInitModules.clear();
    const handlerDir = path.resolve(__dirname, "./handlers");
    const files = fs
      .readdirSync(handlerDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

    for (const file of files) {
      try {
        const importFile = await import(path.join(handlerDir, file));
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

    loadRequestHandlers(app, "commands", "command");
    loadRequestHandlers(app, "views", "view");

    if (
      process.env["SOCKET_MODE"] === "true" &&
      process.env["APP_TOKEN"] &&
      !process.env["KEEP_PORT_USAGE"]
    ) {
      await app.start();
      console.info("[Logpheus] Running as Socket Mode");
    } else {
      const port = process.env["PORT"] ? parseInt(process.env["PORT"]) : 3000;
      console.log(port)
      await app.start({
        port
      });
      console.info("[Logpheus] Running on port:", port);
    }

    console.log(
      "[Logpheus] My prefix is",
      Bun.color("darkseagreen", "ansi") + prefix + "\x1b[0m",
    );

    async function handlerLoop() {
      await loadHandlers();
      setTimeout(handlerLoop, 60 * 1000);
    }

    handlerLoop();
  } catch (err) {
    logger.error({ error: err });
  }
})();

process.on("SIGTERM", async () => {
  await app.stop();
  process.exit(0);
});
