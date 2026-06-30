import ysws, { YSWSId } from "@/ysws";
import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";
import { opClient } from "@/index";

function stripJobApiKey<T>(obj: T) {
  const { jobApiKey, ...rest } = obj as any;
  return rest as Omit<T, "jobApiKey">;
}

export default [
  {
    path: "/api/v2/ysws",
    method: ["GET"],
    handler: (
      req: ParamsIncomingMessage,
      res: ServerResponse<IncomingMessage>,
    ) => {
      const headers = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.setHeaders(headers);
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
      const clean = Object.fromEntries(
        Object.entries(ysws).map(([k, v]) => [
          k,
          stripJobApiKey(v),
        ]),
      );
      return res.end(JSON.stringify(clean));
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
        const clean = Object.fromEntries(
          Object.entries(ysws).map(([k, v]) => [
            k,
            stripJobApiKey(v),
          ]),
        );
        return res.end(JSON.stringify(clean));
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

      return res.end(JSON.stringify(stripJobApiKey(item)));
    },
  },
];
