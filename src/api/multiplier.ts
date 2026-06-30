import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import main from "@/index.ts";
import checkAPIKey from "@/lib/apiKeyCheck";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { MultiplierError, MultiplierPostGet } from "@/apiSchema/multiplier";
import { projects } from "@/schema/projects";
import { MultiplierProjectID } from "@/apiSchema/multiplier";
import ysws, { YSWSId } from "@/ysws";
import { yswsUsers } from "@/schema/ysws";
import { rateLimit } from "@/api/index";
import { opClient } from "@/index";
type ProjectRow = typeof projects.$inferSelect;

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
    path: "/api/v2/:yswsId/:projectId/multiplier",
    method: ["GET", "POST"],
    handler: async (
      req: ParamsIncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => {
      const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.setHeaders(headers);
      try {
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

        if (!req.params!["yswsId"] || !req.params!["projectId"]) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              msg: "Pwovide pwoject id wike /api/v2/{yswsId}/${projectId}/multiplier",
            }),
          );
          return;
        }

        const projectId = MultiplierProjectID.parse(
          req.params!["projectId"],
        )
        const yswsId = YSWSId.parse(req.params!["yswsId"])
        const yswsData = Object.values(ysws).find((record) => record.id === yswsId);
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

        const checkKey = preReplaceAPIKey.replace(/^Bearer\s+/i, "");
        const working = await checkAPIKey({
          db: main.pg,
          apiKey: checkKey,
          logger: main.logger,
        });
        if (!working.works) {
          res.writeHead(401);
          res.end(
            JSON.stringify({
              msg: "Oh nyo?!?! We f-faiwed to authenticate you, check the *boops your nose* pwovided api key.",
            }),
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

        if (!userYSWS[0]?.projects?.includes(projectId)) {
          res.writeHead(404);
          res.end(
            JSON.stringify({
              msg: "This pwoject isn't undew youw account?!!",
            }),
          );
          return;
        }

        const updateFields: Partial<ProjectRow> = {};
        switch (req.method) {
          case "POST": {
            const unparsedBody =
              await readJson<z.infer<typeof MultiplierPostGet>>(req);
            const body = MultiplierPostGet.parse(unparsedBody);
            if (body.multiplier < 0 || body.multiplier > yswsData.maxMult) {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(
                JSON.stringify({
                  msg: "Muwtipwiew can nyot be undew 0 ow abuv 30",
                } as z.infer<typeof MultiplierError>),
              );
              return;
            }

            const project = await main.pg
              .select({
                multiplier: projects.multiplier,
              })
              .from(projects)
              .limit(1)
              .where(and(eq(projects.ysws, yswsId), eq(projects.id, projectId)));

            if (!project || project.length === 0) {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(
                JSON.stringify({
                  msg: "This pwoject doesn't exist in the *boops your nose* database",
                } as z.infer<typeof MultiplierError>),
              );
              return;
            }

            const existingMultiplier = project[0]?.multiplier;
            if (existingMultiplier && existingMultiplier === body.multiplier) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(
                JSON.stringify({ multiplier: body.multiplier } as z.infer<
                  typeof MultiplierPostGet
                >),
              );
              return;
            }

            updateFields.multiplier = body.multiplier;

            if (Object.keys(updateFields).length > 0) {
              await main.pg
                .update(projects)
                .set(updateFields)
                .where(and(eq(projects.ysws, yswsId), eq(projects.id, projectId)));
            }

            res.writeHead(200, { "content-type": "application/json" });
            res.end(
              JSON.stringify({ multiplier: body.multiplier } as z.infer<
                typeof MultiplierPostGet
              >),
            );
            return;
          }

          default: {
            const project = await main.pg
              .select({
                multiplier: projects.multiplier,
              })
              .from(projects)
              .limit(1)
              .where(and(eq(projects.ysws, yswsId), eq(projects.id, projectId)));

            if (!project || project.length === 0) {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(
                JSON.stringify({
                  msg: "This pwoject doesn't exist in the *boops your nose* database *whispers to self*",
                } as z.infer<typeof MultiplierError>),
              );
              return;
            }

            const existingMultiplier = project[0]?.multiplier;
            if (!existingMultiplier) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(
                JSON.stringify({
                  multiplier: 0,
                } as z.infer<typeof MultiplierPostGet>),
              );
              return;
            }

            res.writeHead(200, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                multiplier: existingMultiplier,
              } as z.infer<typeof MultiplierPostGet>),
            );
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
        res.end(
          JSON.stringify({ msg: "Internal server error" } as z.infer<
            typeof MultiplierError
          >),
        );
      }
    },
  },
];
