import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import { shopTrack } from "@/schema/shop";
import ysws from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import { getGenericErrorMessage } from "@/lib/genericError";
import type { SectionBlockAccessory, TextObject } from "@slack/web-api";
import type { RegionalCost } from "@/lib/adapters/types";

function diffArrayByKey(prev: any[], next: any[], key: string, path: string) {
  const prevMap = new Map(prev.map((x) => [x?.[key], x]));
  const nextMap = new Map(next.map((x) => [x?.[key], x]));
  const diffs: { field: string; from: unknown; to: unknown }[] = [];

  for (const [id, prevItem] of prevMap) {
    const nextItem = nextMap.get(id);

    if (!nextItem) {
      diffs.push({
        field: `${path}[${id}]`,
        from: prevItem,
        to: null,
      });
      continue;
    }

    for (const k of Object.keys({ ...prevItem, ...nextItem })) {
      if (JSON.stringify(prevItem[k]) !== JSON.stringify(nextItem[k])) {
        diffs.push({
          field: `${path}[${id}].${k}`,
          from: prevItem[k],
          to: nextItem[k],
        });
      }
    }
  }

  for (const [id, nextItem] of nextMap) {
    if (!prevMap.has(id)) {
      diffs.push({
        field: `${path}[${id}]`,
        from: null,
        to: nextItem,
      });
    }
  }

  return diffs;
}

export function diffRaw(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  _canonical: Record<string, unknown>,
): { field: string; from: unknown; to: unknown }[] {
  const ignoredFields = new Set([
    "regionalCosts",
    "id",
    "name",
    "description",
    "baseCost",
    "baseHours",
    "updated_at",
    "image_url",
    "stock",
    "stock_remaining",
    "resolved_region",
  ]);

  const diffs: { field: string; from: unknown; to: unknown }[] = [];
  for (const key of Object.keys(next)) {
    if (ignoredFields.has(key)) continue;

    const prevVal = prev[key];
    const nextVal = next[key];

    if (JSON.stringify(prevVal) === JSON.stringify(nextVal)) continue;

    if (
      Array.isArray(prevVal) &&
      Array.isArray(nextVal) &&
      typeof prevVal[0] === "object"
    ) {
      diffs.push(...diffArrayByKey(prevVal, nextVal, "id", key));
      continue;
    }

    diffs.push({
      field: key,
      from: prevVal,
      to: nextVal,
    });
  }
  return diffs;
}

export function formatRawDiff(
  diffs: { field: string; from: unknown; to: unknown }[],
): string {
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return "_none_";
    if (
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v)
    ) {
      const d = new Date(v);

      const pad = (n: number) => String(n).padStart(2, "0");

      return `${pad(d.getUTCDate())}/${pad(
        d.getUTCMonth() + 1,
      )}/${String(d.getUTCFullYear()).slice(-2)} ${pad(
        d.getUTCHours(),
      )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    }

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
          if (shop.status === 200 || shop.status === 408) continue;
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

        let alrPinged = true;
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
                    text: `<${yswsData.url + "/shop"}|View Shop> - ${alrPinged ? "No ping as already pinged" : "@channel"}`,
                    verbatim: false,
                  },
                ],
              },
              {
                type: "divider",
              },
            ],
          });
          if (!alrPinged) alrPinged = true;
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
              stock: shopItem.stock,
              previousRaw: getRawItem(shopItem.id)
                ? JSON.stringify(getRawItem(shopItem.id))
                : null,
            });

            const priceText = [
              {
                label: "Base Price",
                value: `*${shopItem.baseCost} ${yswsData.currencyName}* (${shopItem.baseHours}hrs)`,
              },
              {
                label: "Stock",
                value:
                  shopItem.stock !== null
                    ? `${shopItem.stock} available`
                    : "Infinite",
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
                      text: `<${yswsData.url + "/shop"}|View Shop> - ${alrPinged ? "No ping as already pinged" : "@channel"}`,
                      verbatim: false,
                    },
                  ],
                },
                {
                  type: "divider",
                },
              ],
            });
            if (!alrPinged) alrPinged = true;
            continue;
          }

          const storedRegional: Record<string, RegionalCost> = JSON.parse(
            stored.regionalCosts ?? "{}",
          );
          const baseCostChange = stored.baseCost !== shopItem.baseCost;
          const nameChange = stored.name !== shopItem.name;
          const descChange = stored.description !== shopItem.description;
          const stockChange = stored.stock !== shopItem.stock;
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
            regionalChanges.length > 0 ||
            stockChange ||
            rawDiffs.length > 0
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
                stock: shopItem.stock,
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
            if (stockChange) changes.push("Stock");

            const changeText = [
              {
                label:
                  changes.length > 0
                    ? `${changes.join(", ")} has changed!`
                    : rawDiffs.length > 0
                      ? ""
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
              ...(stockChange
                ? [
                    {
                      label: "Stock",
                      value: `${stored.stock === null ? "Infinite" : stored.stock} → *${shopItem.stock === null ? "Infinite" : shopItem.stock}*`,
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

            const rawDiffText = (() => {
              if (rawDiffs.length === 0) return "";
              const reverse = 64;
              let included = 0;
              for (; included < rawDiffs.length; included++) {
                const candidate =
                  "\n*Other Changes:*\n" +
                  formatRawDiff(rawDiffs.slice(0, included + 1));

                if ((changeText + candidate).length > 3000 - reverse) break;
              }
              if (included === 0) return "";
              let text =
                "\n*Other Changes:*\n" +
                formatRawDiff(rawDiffs.slice(0, included));
              if (included < rawDiffs.length) {
                text += `\n... and ${rawDiffs.length - included} more changes.`;
              }
              return text;
            })();

            await client.chat.postMessage({
              channel: yswsData.jobConfig.shopTrack.channelId,
              unfurl_links: false,
              blocks: [
                {
                  type: "header",
                  text: {
                    type: "plain_text",
                    text: `${changes.length + rawDiffs.length} change${changes.length + rawDiffs.length > 1 ? "s" : ""} to ${shopItem.name} detected!`,
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
                      text: `<${yswsData.url + "/shop"}|View Shop> - ${alrPinged ? "No ping as already pinged" : "@channel"}`,
                      verbatim: false,
                    },
                  ],
                },
                {
                  type: "divider",
                },
              ],
            });
            if (!alrPinged) alrPinged = true;
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
