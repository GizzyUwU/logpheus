import ysws, { YSWSId } from "@/ysws";
import type { ParamsIncomingMessage } from "@slack/bolt/dist/receivers/ParamsIncomingMessage";
import type { ServerResponse, IncomingMessage } from "node:http";

export default [
  {
    path: "/api/v1/ysws",
    method: ["GET"],
    handler: (_: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify(ysws)
      );
    },
  },
  {
    path: "/api/v1/ysws/:yswsId",
    method: ["GET"],
    handler: (req: ParamsIncomingMessage, res: ServerResponse<IncomingMessage>) => {
      if (!req.params!["yswsId"]) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(
          JSON.stringify(ysws)
        );
      }

      const data = YSWSId.parse(req.params!["yswsId"]);
      const item = Object.values(ysws).find((x) => x.id === data);
     
       if (!item) {
         res.writeHead(404, { "content-type": "application/json" });
         return res.end(JSON.stringify({ error: "Not found" }));
       }
     
       res.writeHead(200, { "content-type": "application/json" });
       return res.end(JSON.stringify(item));
     }
  },
]