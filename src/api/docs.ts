import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import { createDocument } from "zod-openapi";
import openapiSpecification from "../oapiDocument";
const document = createDocument(openapiSpecification);

export default [
  {
    path: "/api/v1/docs",
    method: ["GET"],
    handler: async (req: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
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
    handler: async (req: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
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
]