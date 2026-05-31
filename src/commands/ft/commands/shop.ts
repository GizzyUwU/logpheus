import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "@/lib/ft/index";
import type { RequestHandler } from "@/index.ts";
import checkAPIKey from "@/lib/ft/apiKeyCheck";
import { getGenericErrorMessage } from "@/lib/genericError";

export default {
  name: "shop",
  params: "[itemId]",
  desc: "Look through the items on the shop and maybe add it to your goals!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, client, logger, yswsClient, prefix, folder, yswsData }: RequestHandler,
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

    const apiKey = String(yswsData?.apiKey);
    const working = await checkAPIKey({
      db: pg,
      apiKey,
      userId: command.user_id,
      yswsData: yswsData!,
      logger,
    });

    if (!working.works)
      return respond({
        text: `Hey! Your api key is currently failing the test to see if it works, run /${prefix}-${folder} config to re-enter your api key to fix it.`,
        response_type: "ephemeral",
      });

    if (!yswsClient)
      return respond({
        text: `Unexpected error has occured`,
        response_type: "ephemeral",
      });

    let ftClient: FT = yswsClient.raw as FT;

    if (!id) {
      const items = await ftClient.shop();

      if (!items || !items.status) {
        return respond({
          text: "Unexpected error has occurred.",
          response_type: "ephemeral",
        });
      }

      if (!items.ok || !items.data?.length) {
        switch (items.status) {
          default:
            const msg = getGenericErrorMessage(items.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occured!",
              response_type: "ephemeral",
            });
        }
      }

      const text =
        "*Items*:\n" +
        (items.data ?? [])
          .filter(
            (item) =>
              item.type !== "ShopItem::Accessory" &&
              !item.attached_shop_item_ids?.some((id) => id != null) &&
              yswsData?.goals &&
              !yswsData.goals.includes(Number(item.id)) &&
              (yswsData?.region && yswsData.region.length > 0
                ? item.enabled?.[
                    `enabled_${yswsData.region.toLowerCase()}` as keyof typeof item.enabled
                  ]
                : true),
          )
          .slice(0, 30)
          .map((item) => {
            const cost =
              yswsData?.region && yswsData.region.length > 0
                ? ((item.ticket_cost as Record<string, number | undefined>)[
                    yswsData.region.toLowerCase()
                  ] ??
                  item.ticket_cost?.base_cost ??
                  0)
                : (item.ticket_cost?.base_cost ?? 0);

            return `• ${item.id || 0} - *${item.name ?? "Untitled"}* - ${cost} :cookie: - ${item.description ?? ""}`;
          })
          .join("\n");

      const goalsResolved = yswsData?.goals
        ? yswsData.goals
            .map((goalId) => items.data.find((item) => item.id === goalId))
            .filter(Boolean)
            .map((item) => {
              const cost =
                yswsData?.region && yswsData.region.length > 0
                  ? ((item!.ticket_cost as Record<string, number | undefined>)[
                      yswsData.region.toLowerCase()
                    ] ??
                    item!.ticket_cost?.base_cost ??
                    0)
                  : (item!.ticket_cost?.base_cost ?? 0);

              return {
                id: item!.id,
                name: item!.name ?? "Untitled",
                cost,
                desc: item!.description ?? "",
              };
            })
        : [];

      const goalsText =
        "*Goals*:\n" +
        goalsResolved
          .map(
            (g) => `• ${g.id} - *${g.name}* - ${g.cost} :cookie: - ${g.desc}`,
          )
          .join("\n");

      return respond({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                yswsData?.region && yswsData.region.length > 0
                  ? "*Flavortown Store with " +
                    yswsData.region.toUpperCase() +
                    "'s Prices*"
                  : "*Flavortown Store*",
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
                text: 'Formatted as "Identifier - Name - Cost - Description"',
              },
            ],
          },
        ],
        response_type: "ephemeral",
      });
    } else {
      const item = await ftClient.item({ id: Number(id) });

      if (!item.ok || !Object.keys(item.data)?.length) {
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
        { label: "Item Name", value: item.data.name ?? "Nuhuh" },
        { label: "Item Description", value: item.data.description ?? "" },
        {
          label: "Item Stock",
          value:
            item.data.limited && item.data.stock != null
              ? String(item.data.stock)
              : "Infinite",
        },
        {
          label: "Item Cost",
          value: item.data.ticket_cost
            ? String(item.data.ticket_cost.base_cost)
            : "0",
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
