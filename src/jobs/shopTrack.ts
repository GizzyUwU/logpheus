import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { shopTrack } from "@/schema/shop";
import ysws from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import { getGenericErrorMessage } from "@/lib/genericError";
import type { SectionBlockAccessory, TextObject } from "@slack/web-api";
import type { RegionalCost } from "@/lib/adapters/types";

export default {
  name: "shopTrack",
  execute: async ({ clients, client, pg, logger, prefix }: RequestHandler) => {
    try {
      for (const yswsData of Object.values(ysws)) {
        if (!yswsData.jobs.includes("shopTrack")) continue;
        if (
          !yswsData.jobConfig.shopTrack ||
          !yswsData.jobConfig.shopTrack.channelId ||
          (yswsData.apiKeyRequired && !yswsData.jobConfig.shopTrack.jobApiKey)
        ) {
          logger.info("shopTrack job skipped becasue didn't meet requirements");
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
          ctx.error("shopTrack failed because shop api fail");
          continue;
        }

        if (!shop.ok || !shop.data?.length) {
          if (shop.status === 408) continue;
          const msg = getGenericErrorMessage(shop.status, prefix!);
          const ctx = logger.with({
            error: shop.data,
            msg,
            status: shop.status,
            ok: shop.ok,
          });
          ctx.error("shopTrack failed because shop api fail");
          continue;
        }

        const storedItems = await pg
          .select()
          .from(shopTrack)
          .where(eq(shopTrack.yswsId, yswsData.id));

        if (storedItems.length === 0) {
          await pg.insert(shopTrack).values(
            shop.data.map((item) => ({
              yswsId: yswsData.id,
              id: item.id,
              name: item.name,
              description: item.description,
              baseHours: item.baseHours,
              baseCost: item.baseCost,
              regionalCosts: JSON.stringify(item.regionalCosts),
            })),
          );
          continue;
        }

        const storedMap = new Map(storedItems.map((item) => [item.id, item]));
        for (const shopItem of shop.data) {
          const stored = storedMap.get(shopItem.id);
          if (!stored) {
            await pg.insert(shopTrack).values({
              yswsId: yswsData.id,
              id: shopItem.id,
              name: shopItem.name,
              description: shopItem.description,
              baseHours: shopItem.baseHours,
              baseCost: shopItem.baseCost,
              regionalCosts: JSON.stringify(shopItem.regionalCosts),
            });

            const priceText = [
              {
                label: "Base Price",
                value: `${shopItem.baseCost} Gold (${shopItem.baseHours}hrs)`,
              },
              { label: "Regional Pricing:", value: "" },
              ...Object.entries(shopItem.regionalCosts).map(
                ([region, cost]) => ({
                  label: region,
                  value: cost.available
                    ? `${cost.currency} Gold (${cost.hours}hrs)`
                    : "Not available in the region",
                }),
              ),
            ]
              .map((f) => `*${f.label}*: ${f.value}`)
              .join("\n");

            await client.chat.postMessage({
              channel: yswsData.jobConfig.shopTrack.channelId,
              unfurl_links: false,
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: `New item added to the shop!`,
                  },
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text:
                      `*${shopItem.name}*\n` +
                      (() => {
                        const desc = `_${shopItem.description
                          .split("\n")
                          .map((line: string) => line)
                          .join("\n")}_`;
                        return desc.length > 500
                          ? desc.slice(0, desc.lastIndexOf(" ", 497)) + "..._"
                          : desc;
                      })(),
                  },
                },
                ...(Object.keys(shopItem.regionalCosts).length > 0
                  ? ([
                      {
                        type: "section",
                        text: {
                          type: "mrkdwn",
                          text: priceText,
                        },
                        accessory: {
                          type: "image",
                          image_url: shopItem.image_url,
                          alt_text: shopItem.name,
                        },
                      },
                    ] as {
                      type: string;
                      text: TextObject;
                      accessory: SectionBlockAccessory;
                    }[])
                  : ([
                      {
                        type: "section",
                        text: {
                          type: "mrkdwn",
                          text: `*Base Price*: ${shopItem.baseCost} (${shopItem.baseHours}hrs)`,
                        },
                      },
                    ] as {
                      type: string;
                      text: TextObject;
                    }[])),
              ],
            });
            continue;
          }

          const storedRegional: Record<string, RegionalCost> = JSON.parse(
            stored.regionalCosts ?? "{}",
          );
          const baseCostChange = stored.baseCost !== shopItem.baseCost;
          const nameChange = stored.name !== shopItem.name;
          const descChange = stored.description !== shopItem.description;
          const regionalChanges = Object.entries(shopItem.regionalCosts).filter(
            ([region, cost]) =>
              storedRegional[region]?.currency !== cost.currency,
          );

          if (
            baseCostChange ||
            nameChange ||
            descChange ||
            regionalChanges.length > 0
          ) {
            await pg
              .update(shopTrack)
              .set({
                name: shopItem.name,
                description: shopItem.description,
                baseCost: shopItem.baseCost,
                baseHours: shopItem.baseHours,
                regionalCosts: JSON.stringify(shopItem.regionalCosts),
              })
              .where(
                and(
                  eq(shopTrack.yswsId, yswsData.id),
                  eq(shopTrack.id, shopItem.id),
                ),
              );

            const changes: string[] = [];
            
            if (stored.name !== shopItem.name) changes.push("Name");
            if (descChange) changes.push("Description");
            if (baseCostChange) changes.push("Base Price");
            if (regionalChanges.length > 0) changes.push("Regional Pricing");
            
            const changeText = [
              {
                label:
                  changes.length > 0
                    ? ` ${changes.join(", ")} has changed!`
                    : "No changes detected",
                value: "",
              },
              {
                label: `${stored.name !== shopItem.name ? `${stored.name} → ${shopItem.name}` : `${stored.name}`}`,
                value: "",
              },
              ...(descChange
                ? [
                    {
                      label: "Description",
                      value: `${stored.description} → *${shopItem.description}*`,
                    },
                  ]
                : []),
              ...(baseCostChange
                ? [
                    {
                      label: "Base Price",
                      value: `${stored.baseCost} → *${shopItem.baseCost} Gold* (${shopItem.baseHours}hrs)`,
                    },
                  ]
                : []),
              ...(regionalChanges.length > 0
                ? [{ label: "Regional Pricing:", value: "" }]
                : []),
              ...regionalChanges.map(([region, cost]) => ({
                label: region,
                value: cost.available
                  ? `${storedRegional[region]?.currency ?? "?"} → *${cost.currency} Gold* (${cost.hours}hrs)`
                  : "Not available in the region",
              })),
            ]
              .map((f) =>
                f.label && (!f.value || f.value.length === 0)
                  ? `*${f.label}*`
                  : `*${f.label}*: ${f.value}`,
              )
              .join("\n");

            await client.chat.postMessage({
              channel: yswsData.jobConfig.shopTrack.channelId,
              unfurl_links: false,
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: `${changes.length} change${changes.length > 1 ? "s" : ""} to the shop detected!`
                  }
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: changeText,
                    verbatim: false,
                  },
                  accessory: {
                    type: "image",
                    image_url: shopItem.image_url,
                    alt_text: shopItem.name,
                  },
                },
                {
                  type: "context",
                  elements: [
                    {
                      type: "mrkdwn",
                      text: `<${yswsData.url + "/shop"}|View Shop> - @channel`,
                      verbatim: false,
                    },
                  ],
                },
                {
                  type: "divider"
                },
              ],
            });
          }
        }
      }
    } catch (err) {
      const ctx = logger.with({
        error: err,
      });
      ctx.error("shopTrack failed from an error");
    }
  },
};
