import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import checkAPIKey from "../lib/apiKeyCheck";

export default {
  name: "shop",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, client, logger, clients, prefix }: RequestHandler,
  ) => {
    const id = command.text.trim();
    if (!Number.isInteger(Number(id)))
      return respond({
        text: `The shop id provided has to be a valid integer`,
        response_type: "ephemeral",
      });
    const userData = await pg
      .select()
      .from(users)
      .where(eq(users.userId, command.user_id))
      .limit(1);

    if (userData.length === 0)
      return respond({
        text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${prefix}-register`,
        response_type: "ephemeral",
      });

    const apiKey = userData[0]?.apiKey;
    if (!apiKey) {
      const ctx = logger.with({
        user: {
          id: command.user_id,
        },
      });
      ctx.error("User exists in db but lacks an api key in it");
      return respond({
        text: `Hey! Basically you exist in db and lack an api key try fix it using /${prefix}-config`,
        response_type: "ephemeral",
      });
    }

    const working = await checkAPIKey({
      db: pg,
      apiKey,
      logger,
    });
    if (!working)
      return respond({
        text: `Hey! Your api key is currently failing the test to see if it works, run /${prefix}-config to re-enter your api key to fix it.`,
        response_type: "ephemeral",
      });

    let ftClient: FT = clients[apiKey]!;
    if (!ftClient) {
      ftClient = new FT(apiKey, logger);
    }

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
          case 401:
            return respond({
              text: "Bad API Key! Run /" + prefix + "-config to fix!",
              response_type: "ephemeral",
            });
          default:
            return respond({
              text: "Unexpected error has occurred",
              response_type: "ephemeral",
            });
        }
      }

      const text = (items.data ?? [])
        .filter(
          (item) =>
            item.type !== "ShopItem::Accessory" &&
            !item.attached_shop_item_ids?.some((id) => id != null),
        )
        .slice(0, 40)
        .map(
          (item) =>
            `• ${item.id || 0} - *${item.name ?? "Untitled"}* - ${item.ticket_cost ? item.ticket_cost.base_cost : 0} - ${item.description}`,
        )
        .join("\n");

      return respond({
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: "Flavortown Store",
            },
          },
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
                text: "Formatted as \"Identifier - Name - Cost - Description\"",
              },
            ],
          },
        ],
        response_type: "ephemeral",
      });
    } else {
      const item = await ftClient.item({ id });

      if (!item.ok || !Object.keys(item.data)?.length) {
        switch (item.status) {
          case 401:
            return respond({
              text: "Bad API Key! Run /" + prefix + "-config to fix!",
              response_type: "ephemeral",
            });
          default:
            return respond({
              text: "Unexpected error.",
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
