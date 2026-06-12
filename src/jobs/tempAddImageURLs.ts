import { and, eq, isNull, or } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { shopTrack } from "@/schema/shop";
import ysws, { jobOptions } from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import { getGenericErrorMessage } from "@/lib/genericError";
import { z } from "zod";

export default {
  name: "tempAddImageURLs" as z.infer<typeof jobOptions>,
  execute: async ({ clients, pg, logger, prefix }: RequestHandler) => {
    try {
      for (const yswsData of Object.values(ysws)) {
        if (!yswsData.jobs.includes("tempAddImageURLs")) continue;
        if (
          !yswsData.jobConfig.shopTrack ||
          !yswsData.jobConfig.shopTrack.channelId ||
          (yswsData.apiKeyRequired && !yswsData.jobConfig.shopTrack.jobApiKey)
        ) {
          logger.info(
            "tempAddImageURLs job skipped becasue didn't meet requirements",
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
          ctx.error("tempAddImageURLs failed because shop api fail");
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
          ctx.error("tempAddImageURLs failed because shop api fail");
          continue;
        }

        const storedItems = await pg
          .select()
          .from(shopTrack)
          .where(
            and(
              eq(shopTrack.yswsId, yswsData.id),
              or(
                eq(shopTrack.imageUrl, ""),
                isNull(shopTrack.imageUrl)
              )
            )
          )

        if (storedItems.length === 0) continue;
        const itemMap = new Map(shop.data.map((item) => [item.id, item]));
        for (const shopItem of storedItems) {
          const item = itemMap.get(shopItem.id);

          await pg
            .update(shopTrack)
            .set({
              imageUrl: item?.image_url ?? "",
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
      ctx.error("tempAddImageURLs failed from an error");
    }
  },
};
