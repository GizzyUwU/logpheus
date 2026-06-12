import { and, eq, isNull, or } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { shopTrack } from "@/schema/shop";
import ysws, { jobOptions } from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import { getGenericErrorMessage } from "@/lib/genericError";
import { z } from "zod";

export default {
  name: "tempShopMigration" as z.infer<typeof jobOptions>,
  execute: async ({ clients, pg, logger, prefix }: RequestHandler) => {
    try {
      for (const yswsData of Object.values(ysws)) {
        if (!yswsData.jobs.includes("tempShopMigration")) continue;
        if (
          !yswsData.jobConfig.shopTrack ||
          !yswsData.jobConfig.shopTrack.channelId ||
          (yswsData.apiKeyRequired && !yswsData.jobConfig.shopTrack.jobApiKey)
        ) {
          logger.info(
            "tempShopMigration job skipped becasue didn't meet requirements",
          );
          continue;
        }

        const clientKey = `${yswsData.id}:shopTrack`;
        if (!clients[clientKey]) {
          const AdapterClass = await loadAdapter(yswsData.adapter);
          clients[clientKey] = new AdapterClass(
            yswsData.apiKeyRequired
              ? yswsData.jobConfig.shopTrack.jobApiKey
              : undefined,
            logger,
          );
        }

        const yswsClient = clients[clientKey];
        const shop = await yswsClient.shop();
        if (!shop || !shop.status) {
          const ctx = logger.with({
            error: shop.data,
            status: shop.status,
            ok: shop.ok,
          });
          ctx.error("tempShopMigration failed because shop api fail");
          continue;
        }

        if (!shop.ok || !shop.data?.length) {
          if (shop.status === 408) continue;
          const msg = getGenericErrorMessage(shop.status, prefix!);
          if (msg === "Server is down!" || msg === "Server timed out!")
            continue;
          const ctx = logger.with({
            error: shop.data,
            msg,
            status: shop.status,
            ok: shop.ok,
          });
          ctx.error("tempShopMigration failed because shop api fail");
          continue;
        }

        const storedItems = await pg
          .select()
          .from(shopTrack)
          .where(
            and(
              eq(shopTrack.yswsId, yswsData.id),
              or(eq(shopTrack.previousRaw, ""), isNull(shopTrack.previousRaw), eq(shopTrack.previousRaw, "null")),
            ),
          );

        if (storedItems.length === 0) continue;
        const rawItems = Array.isArray(shop.raw) ? (shop.raw as Record<string, unknown>[]) : [];
        const itemMap = new Map(rawItems.map((item) => [item["id"] as number, item]));
        for (const shopItem of storedItems) {
          const item = itemMap.get(shopItem.id);
          if (!item) continue;
          await pg
            .update(shopTrack)
            .set({
              previousRaw: item ? JSON.stringify(item) : null,
            })
            .where(
              and(
                eq(shopTrack.yswsId, yswsData.id),
                eq(shopTrack.id, shopItem.id),
              ),
            );
        }
      }
    } catch (err) {
      const ctx = logger.with({
        error: err,
      });
      ctx.error("tempShopMigration failed from an error");
    }
  },
};
