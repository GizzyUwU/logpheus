import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import main from "..";
import checkAPIKey from "../lib/apiKeyCheck";
import FT from "../lib/ft";
import { getGenericErrorMessage } from "../lib/genericError";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { MultiplierError, MultiplierPostGet } from "../apiSchema/multiplier";
type UserRow = typeof users._.inferSelect;

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

// S B O  I  H L I G M  A  G N O N  T  M K  T I  E D O N  S N H L
export default [
  {
    path: "/api/v1/multiplier",
    method: ["GET", "POST", "PUT", "DELETE"],
    handler: async (
      req: ParamsIncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => {
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

        const updateFields: Partial<UserRow> = {};
        const apiKey = checkKey!;
        switch (req.method) {
          case "POST": {
            const unparsedBody =
              await readJson<z.infer<typeof MultiplierPostGet>>(req);
            const body = MultiplierPostGet.parse(unparsedBody);
            if (body.multiplier < 0 || body.multiplier > 30) {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(
                JSON.stringify({
                  msg: "Multiplier can not be under 0 or above 30",
                } as z.infer<typeof MultiplierError>),
              );
              return;
            }

            const existingMultiplier = (updateFields.meta ?? []).find(
              (entry: string) => entry.startsWith("Multiplier::"),
            );

            if (Number(existingMultiplier) === body.multiplier) {
              res.writeHead(200, { "content-type": "application/json" });
              res.end(
                JSON.stringify({ multiplier: body.multiplier } as z.infer<
                  typeof MultiplierPostGet
                >),
              );
              return;
            }

            const filteredMeta = (updateFields.meta ?? []).filter(
              (entry) => !entry.startsWith("Region::"),
            );
            updateFields.meta = [
              ...filteredMeta,
              "Multiplier::" + body.multiplier,
            ];

            if (Object.keys(updateFields).length > 0) {
              await main.pg
                .update(users)
                .set(updateFields)
                .where(eq(users.apiKey, apiKey));
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
            const existingMultiplier = (updateFields.meta ?? []).find(
              (entry: string) => entry.startsWith("Multiplier::"),
            );

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
                multiplier: Number(existingMultiplier),
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

        res.end(
          JSON.stringify({ msg: "Internal server error" } as z.infer<
            typeof MultiplierError
          >),
        );
      }
    },
  },
];
// A I  S  O D N  E  T  U P I T  O  A E  H S  N P I T  E D  E P
