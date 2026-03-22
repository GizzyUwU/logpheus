import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";

export default [
  {
    path: "/",
    method: ["GET"],
    handler: (_: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
      res.writeHead(302, {
        Location: "https://flavortown.hackclub.com/projects/1865",
      });
      res.end();
    },
  },
];