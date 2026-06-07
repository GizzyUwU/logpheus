import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";

export default [
  {
    path: "/",
    method: ["GET"],
    handler: (_: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
      res.writeHead(301, {
        Location: "https://macondo.hackclub.com/projects/5464",
      });
      res.end();
    },
  },
];