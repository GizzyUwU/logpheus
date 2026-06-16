import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { shopTrack } from "@/schema/shop";
import ysws from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import { getGenericErrorMessage } from "@/lib/genericError";
import type { SectionBlockAccessory, TextObject } from "@slack/web-api";
import type { RegionalCost } from "@/lib/adapters/types";

export function diffRaw(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  canonical: Record<string, unknown>,
): { field: string; from: unknown; to: unknown }[] {
  const coveredValues = new Set(
    Object.values(canonical).map((v) => JSON.stringify(v)),
  );
  return Object.keys(next)
    .filter((k) => {
      if (JSON.stringify(prev[k]) === JSON.stringify(next[k])) return false;
      return !coveredValues.has(JSON.stringify(next[k]));
    })
    .map((k) => ({ field: k, from: prev[k], to: next[k] }));
}

export function formatRawDiff(
  diffs: { field: string; from: unknown; to: unknown }[],
): string {
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return "_none_";
    if (typeof v === "boolean") return v ? "yes" : "no";
    if (typeof v === "object") return `\`${JSON.stringify(v)}\``;
    return String(v);
  };
  return diffs
    .map(({ field, from, to }) => {
      const label = field.replace(/_/g, " ");
      return `*${label}*: ${fmt(from)} → *${fmt(to)}*`;
    })
    .join("\n");
}

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
          if (msg === "Server is down!" || msg === "Server timed out!")
            continue;
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

        const rawItems = Array.isArray(shop.raw)
          ? (shop.raw as Record<string, unknown>[])
          : [];
        const getRawItem = (id: number) =>
          rawItems.find((r) => r["id"] === id) ?? null;
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
              previousRaw: getRawItem(item.id)
                ? JSON.stringify(getRawItem(item.id))
                : null,
            })),
          );
          continue;
        }

        const storedMap = new Map(storedItems.map((item) => [item.id, item]));
        const liveIds = new Set(shop.data.map((item) => item.id));

        for (const [id, stored] of storedMap) {
          if (liveIds.has(id)) continue;

          await pg
            .delete(shopTrack)
            .where(
              and(eq(shopTrack.yswsId, yswsData.id), eq(shopTrack.id, id)),
            );

          const changeText = [
            {
              label: "1 item was removed from the shop!",
              value: "",
            },
            {
              label: `${stored.name} was removed.`,
              value: "",
            },
            {
              label: "Base price was",
              value: `*${stored.baseCost} ${yswsData.currencyName}* (${stored.baseHours}hrs)`,
            },
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
                  text: `Shop has updated!`,
                },
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
                  image_url:
                    stored.imageUrl ??
                    "https://png.pngtree.com/png-vector/20221125/ourlarge/pngtree-no-image-available-icon-flatvector-illustration-pic-design-profile-vector-png-image_40966566.jpg",
                  alt_text: stored.name,
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
                type: "divider",
              },
            ],
          });
        }

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
              imageUrl: shopItem.image_url,
              regionalCosts: JSON.stringify(shopItem.regionalCosts),
              previousRaw: getRawItem(shopItem.id)
                ? JSON.stringify(getRawItem(shopItem.id))
                : null,
            });

            const priceText = [
              {
                label: "Base Price",
                value: `*${shopItem.baseCost} ${yswsData.currencyName}* (${shopItem.baseHours}hrs)`,
              },
              { label: "Regional Pricing:", value: "" },
              ...Object.entries(shopItem.regionalCosts).map(
                ([region, cost]) => ({
                  label: region,
                  value: cost.available
                    ? `${cost.currency} ${yswsData.currencyName} (${cost.hours}hrs)`
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
                          text: `*Base Price*: *${shopItem.baseCost} ${yswsData.currencyName}* (${shopItem.baseHours}hrs)`,
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
                    }[])),
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
                  type: "divider",
                },
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

          const rawItem = getRawItem(shopItem.id);
          const rawDiffs = (() => {
            if (!stored.previousRaw || !rawItem) return [];
            try {
              const prev = JSON.parse(stored.previousRaw) as Record<
                string,
                unknown
              >;
              return diffRaw(
                prev,
                rawItem,
                shopItem as unknown as Record<string, unknown>,
              );
            } catch {
              return [];
            }
          })();

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
                imageUrl: shopItem.image_url,
                regionalCosts: JSON.stringify(shopItem.regionalCosts),
                previousRaw: JSON.stringify(rawItem),
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
                      value: `${stored.baseCost} → *${shopItem.baseCost} ${yswsData.currencyName}* (${shopItem.baseHours}hrs)`,
                    },
                  ]
                : []),
              ...(regionalChanges.length > 0
                ? [{ label: "Regional Pricing:", value: "" }]
                : []),
              ...regionalChanges.map(([region, cost]) => ({
                label: region,
                value: cost.available
                  ? `${storedRegional[region]?.currency ?? "?"} → *${cost.currency} ${yswsData.currencyName}* (${cost.hours}hrs)`
                  : "Not available in the region",
              })),
            ]
              .map((f) =>
                f.label && (!f.value || f.value.length === 0)
                  ? `*${f.label}*`
                  : `*${f.label}*: ${f.value}`,
              )
              .join("\n");

            const rawDiffText =
              rawDiffs.length > 0
                ? "\n*Other changes:*\n" + formatRawDiff(rawDiffs)
                : "";

            await client.chat.postMessage({
              channel: yswsData.jobConfig.shopTrack.channelId,
              unfurl_links: false,
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: `${changes.length + rawDiffs.length} change${changes.length + rawDiffs.length > 1 ? "s" : ""} to the shop detected!`,
                  },
                },
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: changeText + rawDiffText,
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
                  type: "divider",
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
