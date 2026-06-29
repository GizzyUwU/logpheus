import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import { errorInLastFiveMinutes } from "@/index";

export default [
  {
    path: "/healthcheck",
    method: ["GET"],
    handler: (_: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
      res.writeHead(200);
      res.end(JSON.stringify({
        okay: errorInLastFiveMinutes > 5 ? false : true,
        errorCount: errorInLastFiveMinutes
      }));
    },
  },
]