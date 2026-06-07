import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import main from "@/index";
import checkAPIKey from "@/lib/apiKeyCheck";
import { getGenericErrorMessage } from "@/lib/genericError";
import { and, eq } from "drizzle-orm";
import { rateLimit } from "@/api/index.ts";
import { yswsUsers } from "@/schema/ysws";
import ysws, { YSWSId } from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import { opClient } from "@/index";
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
    path: "/api/v2/:yswsId/goals",
    method: ["GET", "POST", "PUT", "DELETE"],
    handler: async (
      req: ParamsIncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => {
      try {
        let useOP = false;
        const ip = req.socket.remoteAddress || "unknown";
        if (!rateLimit(ip)) {
          res.writeHead(429, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({ msg: "Too many wequests, try a-again watew." }),
          );
          if (opClient) {
            opClient.identify({
              profileId: String(req.socket.remoteAddress)
            })
            opClient.track("api", {
              endpoint: req.url,
              ratelimit: true
            })
            opClient.clear()
          }
          return;
        }

        if (!req.params!["yswsId"]) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              msg: "Pwovide YSWS id wike this /api/v2/{yswsId}/goals",
            }),
          );
          return;
        }

        const yswsId = YSWSId.parse(req.params!["yswsId"]);
        const yswsData = Object.values(ysws).find(
          (record) => record.id === yswsId,
        );
        if (!yswsData) {
          res.writeHead(404);
          res.end(
            JSON.stringify({
              msg: "The YSWS ID provided isn't valid for this bot.",
            }),
          );
          return;
        }

        const preReplaceAPIKey = req.headers["authorization"];
        if (!preReplaceAPIKey?.startsWith("Bearer ")) {
          res.writeHead(401);
          res.end(
            "You nyeed pwovide youw api key to make use of this endpoint!!",
          );
          return;
        }

        const apiKey = String(preReplaceAPIKey.replace(/^Bearer\s+/i, ""));
        const working = await checkAPIKey({
          db: main.pg,
          apiKey,
          logger: main.logger,
        });
        if (!working.works) {
          res.writeHead(401);
          res.end(
            "Oh nyo?!?! We f-faiwed to authenticate you, check the *boops your nose* pwovided api key.",
          );
          return;
        }

        const userYSWS = await main.pg
          .select()
          .from(yswsUsers)
          .limit(1)
          .where(
            and(
              eq(yswsUsers.userId, working.row.userId),
              eq(yswsUsers.yswsId, yswsId),
            ),
          );

        if (userYSWS.length === 0) {
          res.writeHead(404);
          res.end(
            JSON.stringify({
              msg: "You awen't subscwibed to this YSWS!?",
            }),
          );
          return;
        }

        if (opClient && !working.row?.optOuts?.includes("analytics")) {
          opClient.identify({
            profileId: working.row.userId,
            properties: {
              yswsId: userYSWS[0]?.yswsId,
              friendlyName: yswsData.humanName,
            },
          });
          useOP = true;
        }

        let yswsClient =
          main.clients[`${userYSWS[0]?.yswsId}:${userYSWS[0]?.userId}`];
        if (!yswsClient) {
          const AdapterClass = await loadAdapter(yswsData.adapter);
          const adapter = new AdapterClass(userYSWS[0]?.apiKey, main.logger);
          yswsClient = adapter;
          main.clients[`${userYSWS[0]?.yswsId}:${userYSWS[0]?.userId}`] =
            adapter;
        }

        switch (req.method) {
          case "POST": {
            const body = await readJson<{ goals: number[] }>(req);
            const goals = body?.goals ?? [];
            if (goals.length === 0) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ goals: [] }));
              return;
            }

            const shop = await yswsClient.shop();
            if (!shop || !shop.status) {
              res.writeHead(500, {
                "content-type": "application/json",
              });
              res.end(
                JSON.stringify({
                  msg: "Unyexpected ewwow has occuwwed",
                }),
              );
              if (useOP && opClient) {
                opClient.track("error", {
                  api: true,
                  endpoint: req.url,
                  error: shop,
                });
                opClient.clear();
              }
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
                      msg: msg ?? "Unyexpected ewwow has occuwwed",
                    }),
                  );
                  if (useOP && opClient) {
                    opClient.track("error", {
                      api: true,
                      endpoint: req.url,
                      error: shop,
                    });
                    opClient.clear();
                  }
                  return;
              }
            }

            const validGoalIds = goals.filter((id) =>
              shop.data?.some((item) => item.id === id),
            );

            if (validGoalIds.length === 0) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ goals: [] }));
              return;
            }

            await main.pg
              .update(yswsUsers)
              .set({
                goals,
              })
              .where(
                and(
                  eq(yswsUsers.userId, working.row.userId),
                  eq(yswsUsers.yswsId, yswsId),
                ),
              );

            res.writeHead(200, {
              "content-type": "application/json",
            });

            res.end(JSON.stringify({ goals }));
            if (useOP && opClient) opClient.clear();
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

            const shop = await yswsClient.shop();
            if (!shop || !shop.status) {
              res.writeHead(500, {
                "content-type": "application/json",
              });
              res.end(
                JSON.stringify({
                  msg: "Unyexpected ewwow has occuwwed",
                }),
              );
              if (useOP && opClient) {
                opClient.track("error", {
                  api: true,
                  endpoint: req.url,
                  error: shop,
                });
                opClient.clear();
              }
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
                      msg: msg ?? "Unyexpected ewwow has occuwwed",
                    }),
                  );
                  if (useOP && opClient) {
                    opClient.track("error", {
                      api: true,
                      endpoint: req.url,
                      error: shop,
                    });
                    opClient.clear();
                  }
                  return;
              }
            }

            const validGoalIds = goals.filter((id) =>
              shop.data?.some((item) => item.id === id),
            );

            if (validGoalIds.length === 0) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ goals: [] }));
              return;
            }

            const mergedGoals = [
              ...new Set([...(userYSWS?.[0]?.goals ?? []), ...(goals ?? [])]),
            ];

            await main.pg
              .update(yswsUsers)
              .set({
                goals: mergedGoals,
              })
              .where(
                and(
                  eq(yswsUsers.userId, working.row.userId),
                  eq(yswsUsers.yswsId, yswsId),
                ),
              );

            res.writeHead(200, {
              "content-type": "application/json",
            });

            res.end(JSON.stringify({ goals: mergedGoals }));
            if (useOP && opClient) opClient.clear();
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

            if (!userYSWS[0]?.goals) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ goals: [] }));
              return;
            }

            const remainingGoals = userYSWS[0]?.goals.filter(
              (id) => !goals.includes(id),
            );

            if (remainingGoals.length === userYSWS[0]?.goals.length) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(JSON.stringify({ goals: remainingGoals }));
              return;
            }

            await main.pg
              .update(yswsUsers)
              .set({
                goals: remainingGoals,
              })
              .where(
                and(
                  eq(yswsUsers.userId, working.row.userId),
                  eq(yswsUsers.yswsId, yswsId),
                ),
              );

            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ goals: remainingGoals }));
            if (useOP && opClient) opClient.clear();
            return;
          }

          default: {
            if (!userYSWS[0]?.goals) {
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

            res.writeHead(200, {
              "content-type": "application/json",
            });

            res.end(JSON.stringify({ goals: userYSWS[0]?.goals }));   
            if (useOP && opClient) opClient.clear();
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

        if (opClient) {
          opClient.identify({
            profileId: req.socket.remoteAddress ?? "noip"
          })
          opClient.track("error", {
            api: true,
            endpoint: req.url,
            error: err,
          });
          opClient?.clear();
        }
        res.end(JSON.stringify({ msg: "Internal server error" }));
      }
    },
  },
];
