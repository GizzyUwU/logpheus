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

export default {
  name: "shop",
  params: "[itemId]",
  desc: "Look through the items on the shop and maybe add it to your goals!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    {
      client,
      yswsClient,
      prefix,
      folder,
      yswsData,
    }: RequestHandler,
  ) => {
    if (yswsData && Object.keys(yswsData).length === 0)
      return respond({
        text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
        response_type: "ephemeral",
      });

    const id = command.text.replace(/[^a-zA-Z0-9\s]/g, "").trim();
    if (!Number.isInteger(Number(id)))
      return respond({
        text: `The shop id provided has to be a valid integer`,
        response_type: "ephemeral",
      });

    if (!yswsClient)
      return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

    const mcClient: Macondo = yswsClient.raw as Macondo;

    if (!id) {
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
          yswsData?.goals &&
          !yswsData.goals.includes(Number(item.id)) &&
          (yswsData?.region && yswsData.region.length > 0
            ? item.regional_pricing?.[yswsData.region.toUpperCase()]
                ?.available !== false
            : true),
      );

      const itemLines: string[] = [];
      for (const item of allItems) {
        const cost = resolveItemPrice(item, yswsData?.region ?? undefined);
        const line = `• ${item.id || 0} - *${item.name ?? "Untitled"}* - ${cost} ${item.price_fruit_type} - ${item.extra_fruity}`;
        const projected = "*Items*:\n" + [...itemLines, line].join("\n");
        if (projected.length > 3000) break;
        itemLines.push(line);
      }

      const text = "*Items*:\n" + itemLines.join("\n");

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
                yswsData?.region && yswsData.region.length > 0
                  ? "*Macondo Store with " +
                    yswsData.region.toUpperCase() +
                    "'s Prices*"
                  : "*Macondo Store*",
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
        ],
        response_type: "ephemeral",
      });
    } else {
      const item = await mcClient.shopItem({ itemId: Number(id) });

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
                text:
                  "https://flavortown.hackclub.com/shop/order?shop_item_id=" +
                  item.data.id,
              },
            ],
          },
        ],
      });
    }
  },
};
