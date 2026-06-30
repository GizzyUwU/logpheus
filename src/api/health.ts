import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import { errorInLastFiveMinutes } from "@/index";

export default [
  {
    path: "/healthcheck",
    method: ["GET"],
    handler: (_: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
      const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.setHeaders(headers);
      res.writeHead(200);
      res.end(JSON.stringify({
        okay: errorInLastFiveMinutes >= 5 ? false : true,
        errorCount: errorInLastFiveMinutes
      }));
    },
  },
]