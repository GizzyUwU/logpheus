import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { getGenericErrorMessage } from "@/lib/genericError";
import type Macondo from "@/lib/macondo";

function resolveItemPrice(
  item: {
    price_hours: number;
    price_gold: number;
    regional_pricing: Record<
      string,
      {
        available?: boolean | undefined;
        store_url?: string | null | undefined;
        price_hours?: number | undefined;
      }
    > | null;
  },
  userRegion?: string,
): number {
  if (!userRegion || userRegion.length === 0) {
    return item.price_hours;
  }

  const regionalEntry = item.regional_pricing?.[userRegion.toUpperCase()];
  return regionalEntry?.price_hours ?? item.price_hours;
}

function resolveItemGold(
  item: {
    price_hours: number;
    price_gold: number;
    regional_pricing: Record<
      string,
      {
        available?: boolean | undefined;
        store_url?: string | null | undefined;
        price_hours?: number | undefined;
      }
    > | null;
  },
  userRegion?: string,
): number {
  const goldMultiplier = item.price_gold / item.price_hours;
  const resolvedHours = resolveItemPrice(item, userRegion);
  return Math.round(resolvedHours * goldMultiplier);
}

function normalizeSearchVal(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function paginateLines(lines: string[]): string[] {
  const pages: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current ? current + "\n" + line : line;
    if (next.length > 2800) {
      pages.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) pages.push(current);
  return pages;
}

function getPageArg(input: string): number | null {
  const match = input.match(/(?:^|\s)-p\s+(\d+)(?:\s|$)/i);
  if (!match || !match[1]) return null;
  const page = Number.parseInt(match[1], 10);
  if (Number.isNaN(page)) return null;
  return Math.max(1, page);
}

export default {
  name: "shop",
  params: "[itemId|name]",
  desc: "Look through the items on the shop and maybe add it to your goals!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { client, yswsClient, prefix, folder, yswsData }: RequestHandler,
  ) => {
    if (yswsData && Object.keys(yswsData).length === 0)
      return respond({
        text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
        response_type: "ephemeral",
      });
    const requestedPage = getPageArg(command.text);

    const query = command.text
      .replace(/(?:^|\s)-p\s+\d+(?:\s|$)/i, "")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim();

    if (!yswsClient)
      return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

    const mcClient: Macondo = yswsClient.raw as Macondo;

    if (!query) {
      const items = await mcClient.shop();

      if (!items || !items.status) {
        return respond({
          text: "Unexpected error has occurred.",
          response_type: "ephemeral",
        });
      }

      if (!items.ok || !items.data?.items.length) {
        switch (items.status) {
          default:
            const msg = getGenericErrorMessage(items.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occured!",
              response_type: "ephemeral",
            });
        }
      }

      const allItems = (items.data.items ?? []).filter(
        (item) =>
          !(yswsData?.goals ?? []).includes(Number(item.id)) &&
          (yswsData?.region && yswsData.region.length > 0
            ? item.regional_pricing?.[yswsData.region.toUpperCase()]
                ?.available !== false
            : true),
      );
      
      const itemLines = allItems.map((item) => {
        const cost = resolveItemPrice(item, yswsData?.region ?? undefined);
        return `• ${item.id || 0} - *${item.name ?? "Untitled"}* - ${cost} ${item.price_fruit_type} - ${item.extra_fruity}`;
      });
      
      const pages = paginateLines(itemLines);
      const totalPages = Math.max(pages.length, 1);
      const page = requestedPage
        ? Math.min(Math.max(requestedPage, 1), totalPages)
        : 1;
      
      const text = `*Items*:\n${pages[page - 1] ?? "No items available."}`;

      const goalsResolved = yswsData?.goals
        ? yswsData.goals
            .map((goalId) =>
              items.data.items.find((item) => item.id === goalId),
            )
            .filter((item): item is NonNullable<typeof item> => item != null)
            .slice(0, 10)
            .map((item) => {
              const cost = resolveItemPrice(
                item,
                yswsData?.region ?? undefined,
              );
              return {
                id: item.id,
                name: item.name ?? "Untitled",
                cost,
                desc: item.description ?? "",
              };
            })
        : [];

      const goalLines: string[] = [];
      for (const g of goalsResolved) {
        const line = `• ${g.id} - *${g.name}* - ${g.cost} :cookie: - ${g.desc}`;
        const projected = "*Goals*:\n" + [...goalLines, line].join("\n");
        if (projected.length > 3000) break;
        goalLines.push(line);
      }

      const goalsText = "*Goals*:\n" + goalLines.join("\n");

      return respond({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                (yswsData?.region && yswsData.region.length > 0
                  ? "*Macondo Store with " +
                    yswsData.region.toUpperCase() +
                    "'s Prices* "
                  : "*Macondo Store* ") + `(${page}/${totalPages})`,
            },
          },
          ...(yswsData?.goals && yswsData.goals.length > 0
            ? ([
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: goalsText,
                  },
                },
              ] as {
                type: "section";
                text: {
                  type: "mrkdwn";
                  text: string;
                };
              }[])
            : []),
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "plain_text",
                text: 'Formatted as "Identifier - Name - Cost - Extra Fruity Required"',
              },
            ],
          },
          ...(totalPages > 1 ? [{
            type: "context" as const,
            elements: [{
              type: "mrkdwn" as const,
              text: `Use /${prefix}-${folder} shop -p <page> to see other pages`
            }]
          }] : [])
        ],
        response_type: "ephemeral",
      });
    } else {
      if (/^\d+$/.test(query)) {
        const item = await mcClient.shopItem({ itemId: Number(query) });

        if (!item.ok || !item.data || !Object.keys(item.data)?.length) {
          switch (item.status) {
            default:
              const msg = getGenericErrorMessage(item.status, prefix!);
              return respond({
                text: msg ?? "Unexpected error has occured!",
                response_type: "ephemeral",
              });
          }
        }

        const userText = [
          { label: "Item ID", value: item.data.id },
          {
            label: "Item Name",
            value: item.data.name ?? "I'm a pretty little femboy >w<",
          },
          { label: "Item Description", value: item.data.description ?? "" },
          {
            label: "Item Stock",
            value:
              item.data.stock_remaining &&
              (item.data.stock_remaining != null ||
                item.data.stock_remaining !== 0)
                ? String(item.data.stock_remaining)
                : "Infinite",
          },
          {
            label: "Item Cost",
            value: String(
              resolveItemGold(
                item.data,
                yswsData?.region ? yswsData?.region : undefined,
              ),
            ),
          },
        ]
          .map((f) => `*${f.label}*: ${f.value}`)
          .join("\n");
        return await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: item.data.name ?? "Unknown",
                emoji: true,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: userText,
              },
              accessory: {
                type: "image",
                image_url:
                  item.data.image_url ??
                  "https://avatars.slack-edge.com/2026-02-14/10511329972962_1a9fddfb641a31b07789_512.png",
                alt_text: (item.data.name ?? "Unknown") + "'s Image",
              },
            },
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: "https://macondo.hackclub.com/shop",
                },
              ],
            },
          ],
        });
      } else {
        const items = await mcClient.shop();

        if (!items || !items.status) {
          return respond({
            text: "Unexpected error has occurred.",
            response_type: "ephemeral",
          });
        }

        if (!items.ok || !items.data || !Object.keys(items.data)?.length) {
          switch (items.status) {
            default:
              const msg = getGenericErrorMessage(items.status, prefix!);
              return respond({
                text: msg ?? "Unexpected error has occured!",
                response_type: "ephemeral",
              });
          }
        }

        const normalQuery = normalizeSearchVal(query);
        const matches = items.data.items
          .map((item) => ({
            item,
            normalizedName: normalizeSearchVal(item.name ?? ""),
          }))
          .filter(({ normalizedName }) => normalizedName.includes(normalQuery))
          .map(({ item, normalizedName }) => ({
            item,
            score:
              normalizedName === normalQuery
                ? 0
                : normalizedName.startsWith(normalQuery)
                  ? 1
                  : 2,
          }))
          .sort(
            (a, b) =>
              a.score - b.score ||
              (a.item.name ?? "").localeCompare(b.item.name ?? ""),
          );

        if (matches.length === 0)
          return respond({
            text: `Couldn't find a match for "${normalQuery}". Try a different/shorter serach or /${prefix}-${folder} shop to browse all items.`,
            response_type: "ephemeral",
          });

        if (matches.length === 1) {
          const item = matches[0]?.item;
          if (!item)
            return respond({
              text: `Couldn't find a match for "${normalQuery}". Try a different/shorter serach or /${prefix}-${folder} shop to browse all items.`,
              response_type: "ephemeral",
            });

          const userText = [
            { label: "Item ID", value: item.id },
            {
              label: "Item Name",
              value: item.name ?? "I'm a pretty little femboy >w<",
            },
            { label: "Item Description", value: item.description ?? "" },
            {
              label: "Item Stock",
              value:
                item.stock_remaining &&
                (item.stock_remaining != null || item.stock_remaining !== 0)
                  ? String(item.stock_remaining)
                  : "Infinite",
            },
            {
              label: "Item Cost",
              value: String(
                resolveItemGold(
                  item,
                  yswsData?.region ? yswsData?.region : undefined,
                ),
              ),
            },
          ]
            .map((f) => `*${f.label}*: ${f.value}`)
            .join("\n");
          return await client.chat.postEphemeral({
            channel: command.channel_id,
            user: command.user_id,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: item.name ?? "Unknown",
                  emoji: true,
                },
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: userText,
                },
                accessory: {
                  type: "image",
                  image_url:
                    item.image_url ??
                    "https://avatars.slack-edge.com/2026-02-14/10511329972962_1a9fddfb641a31b07789_512.png",
                  alt_text: (item.name ?? "Unknown") + "'s Image",
                },
              },
              {
                type: "divider",
              },
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: "https://macondo.hackclub.com/shop",
                  },
                ],
              },
            ],
          });
        }

        const pickLines = matches.map(({ item }) => {
          return `• ${item.id} - *${item.name ?? "Untitled"}*`;
        });

        const pages = paginateLines(pickLines)
        const totalPages = Math.max(pages.length, 1)
        const page = requestedPage ? Math.min(Math.max(requestedPage, 1), totalPages) : 1;
        const text = pages[page - 1] ?? "No matches found";
        return respond({
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `${matches.length} matche${matches.length > 1 ? "s" : ""} found containing *"${normalQuery}"* (${page}/${totalPages}):\n${text}`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "plain_text",
                  text: `Run /${prefix}-${folder} shop [id] to see one in full detail or refine your search for more accurate result.`,
                },
              ],
            },
          ],
        });
      }
    }
  },
};
