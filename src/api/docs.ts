import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import { createDocument } from "zod-openapi";
import openapiSpecification from "@/oapiDocument";
import { opClient } from "@/index";
import { rateLimit } from ".";
const document = createDocument(openapiSpecification);

export default [
  {
    path: "/api/docs",
    method: ["GET"],
    handler: async (
      req: ParamsIncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => {
      const ip = req.socket.remoteAddress || "unknown";
      if (opClient) {
        opClient.identify({
          profileId: String(req.socket.remoteAddress)
        })
      }
      if (!rateLimit(ip)) {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ msg: "Too many requests, try again later." }));
        if (opClient) {
          opClient.track("api", {
            endpoint: req.url,
            ratelimit: true
          })
          opClient.clear()
        }
        return;
      }
      const url = req.url as string;
      if (opClient) {
        opClient.track("api", {
          endpoint: url,
        })
        opClient.clear()
      }
      
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
    path: "/api/docs/:asset",
    method: ["GET"],
    handler: async (
      req: ParamsIncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => {
      const ip = req.socket.remoteAddress || "unknown";
      if (!rateLimit(ip)) {
        res.writeHead(429, { "Content-Type": "text/plain" });
        res.end("Too many requests, try again later.");
        return;
      }
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
];
