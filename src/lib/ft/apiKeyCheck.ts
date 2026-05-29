import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { and, eq, type InferSelectModel } from "drizzle-orm";
import FT from "@/lib/ft/index";
import type { logger as LogTape } from "../..";
import { yswsUsers } from "@/schema/ysws";
import ysws from "@/ysws";
type DB =
  | (NodePgDatabase<Record<string, never>> & { $client: Pool })
  | (PgliteDatabase<Record<string, never>> & { $client: PGlite });

export default async function checkAPIKey(data: {
  db?: DB;
  yswsData?: InferSelectModel<typeof yswsUsers>;
  apiKey: string | undefined;
  logger: typeof LogTape;
  allowTheDisabled?: boolean;
  userId?: string;
  register?: boolean;
}): Promise<{ works: boolean; row?: InferSelectModel<typeof yswsUsers>; }> {
  if (!data.apiKey) return { works: false };
  if (!data.apiKey.startsWith("ft_sk_")) return { works: false };
  if (!data.yswsData && data.db) {
    const row = await data.db
      .select()
      .from(yswsUsers)
      .where(and(eq(yswsUsers.userId, data.userId!), eq(yswsUsers.yswsId, ysws.flavortown.id)))
      .limit(1);

    if (row.length === 0) return { works: data.register === true && !data.allowTheDisabled };
    if (!data.allowTheDisabled && row[0]?.disabled === true) return { works: false };
    const client = new FT(data.apiKey, data.logger);
    const res = await client.user({
      id: "me",
    });

    return {
      works:
        typeof res.status === "number" && res.status >= 200 && res.status < 300,
      row: row[0]!,
    };
  } else if (data.yswsData) {
    if (Object.keys(data.yswsData).length === 0)
      return { works: data.register === true && !data.allowTheDisabled };
    if (!data.allowTheDisabled && data.yswsData?.disabled === true)
      return { works: false };

    const client = new FT(data.apiKey, data.logger);
    const res = await client.user({
      id: "me",
    });

    return {
      works:
        typeof res.status === "number" && res.status >= 200 && res.status < 300,
      row: data.yswsData,
    };
  } else return { works: false }
}
