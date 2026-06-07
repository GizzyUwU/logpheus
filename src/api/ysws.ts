import ysws, { YSWSId } from "@/ysws";
import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import { opClient } from "@/index";

export default [
  {
    path: "/api/v2/ysws",
    method: ["GET"],
    handler: (
      req: ParamsIncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => {
      if (opClient) {
        opClient.identify({
          profileId: String(req.socket.remoteAddress),
        });
        opClient.track("api", {
          endpoint: req.url,
        });
        opClient.clear();
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(ysws));
    },
  },
  {
    path: "/api/v1/ysws/:yswsId",
    method: ["GET"],
    handler: (
      req: ParamsIncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => {
      if (!req.params!["yswsId"]) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(ysws));
      }

      const data = YSWSId.parse(req.params!["yswsId"]);
      const item = Object.values(ysws).find((x) => x.id === data);

      if (opClient) {
        opClient.identify({
          profileId: String(req.socket.remoteAddress),
          properties: {
            yswsId: data,
            friendlyName: item?.humanName,
          },
        });
        opClient.track("api", {
          endpoint: req.url,
        });
      }

      if (!item) {
        res.writeHead(404, { "content-type": "application/json" });
        if (opClient) {
          opClient.track("error", {
            endpoint: req.url,
            error: "Not found",
          });
        }
        return res.end(JSON.stringify({ error: "Not found" }));
      }

      res.writeHead(200, { "content-type": "application/json" });
      if (opClient) {
        opClient.clear();
      }
      return res.end(JSON.stringify(item));
    },
  },
];
