import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import main from "..";
import checkAPIKey from "../lib/apiKeyCheck";
import FT from "../lib/ft";
import { getGenericErrorMessage } from "../lib/genericError";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
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

export default [
  {
    path: "/api/v1/goals",
    method: ["GET", "POST", "PUT", "DELETE"],
    handler: async (req: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
      try {
        const preReplaceAPIKey = req.headers["authorization"];
        if (!preReplaceAPIKey?.startsWith("Bearer ")) {
          res.writeHead(401);
          res.end("Failed authentication, please provide your api key.");
          return;
        }

        const checkKey = preReplaceAPIKey.replace(/^Bearer\s+/i, "");
        const working = await checkAPIKey({
          db: main.pg,
          apiKey: checkKey,
          logger: main.logger,
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

            let ftClient: FT | undefined = main.clients[apiKey];
            if (!ftClient) {
              ftClient = new FT(apiKey, main.logger);
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
                  const msg = getGenericErrorMessage(shop.status, main.prefix!);
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

            await main.pg
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

            let ftClient: FT | undefined = main.clients[apiKey];
            if (!ftClient) {
              ftClient = new FT(apiKey, main.logger);
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
                  const msg = getGenericErrorMessage(shop.status, main.prefix!);
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

            await main.pg
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

            await main.pg
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
        const ctx = main.logger.with({
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
    }
  }
]