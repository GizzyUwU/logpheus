import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";

export default [
  {
    path: "/healthcheck",
    method: ["GET"],
    handler: (_: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
      res.writeHead(200);
      res.end("I'm ogay!");
    },
  },
]