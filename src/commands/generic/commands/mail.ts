import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import { getGenericErrorMessage } from "@/lib/genericError";
import { z } from "zod";
import { ZTypes } from "@/lib/macondo/types";
import Theseus from "@/lib/theseus";

function resolveItemPrice(
  item: z.infer<typeof ZTypes.ShopItem>,
  userRegion?: string,
): number {
  if (!userRegion || userRegion.length === 0) return item.price_hours;
  const regionalEntry = item.regional_pricing?.[userRegion.toUpperCase()];
  return regionalEntry?.price_hours ?? item.price_hours;
}

function resolveItemGold(
  item: z.infer<typeof ZTypes.ShopItem>,
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

const formatDate = (iso: string) => {
  const d = new Date(iso);

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(
    d.getUTCFullYear(),
  ).slice(-2)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(
    d.getUTCSeconds(),
  )}`;
};

export default {
  name: "mail",
  params: "[mailId]",
  desc: "See all your Hack Club mail!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { client, userData, prefix, folder, yswsData, logger }: RequestHandler,
  ) => {
    if (!userData?.theseusKey)
      return respond({
        text: `You need to run /${prefix} config and add a theseus api key first!`,
        response_type: "ephemeral",
      });
    const requestedPage = getPageArg(command.text);
    const query = command.text
      .replace(/\s*-p\s+\S+/g, "")
      .trim();

    const mailClient = new Theseus(userData.theseusKey, logger);

    if (!query) {
      const items = await mailClient.mail();

      if (!items || !items.status) {
        return respond({
          text: "Unexpected error has occurred.",
          response_type: "ephemeral",
        });
      }

      if (!items.ok || !items.data?.mail.length) {
        switch (items.status) {
          default:
            const msg = getGenericErrorMessage(items.status, prefix!);
            return respond({
              text: msg ?? "Unexpected error has occured!",
              response_type: "ephemeral",
            });
        }
      }

      const itemLines = items.data.mail.map((item) => {
        return `• ${item.id} - <${item.public_url}|${item.title ?? "Untitled"}> - ${item.dispatched_at ? formatDate(item.dispatched_at) : item.mailed_at ? formatDate(item.mailed_at) : item.status === "mailed" ? formatDate(item.updated_at) : "Not dispatched/mail yet"} - ${item.status}`;
      });

      const pages = paginateLines(itemLines);
      const totalPages = Math.max(pages.length, 1);
      const page = requestedPage
        ? Math.min(Math.max(requestedPage, 1), totalPages)
        : 1;

      const text = `${pages[page - 1] ?? "No items available."}`;

      return respond({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Hack Club Mail! (${page}/${totalPages})`,
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
                text: 'Formatted as "ID - Title - Dispatched/Mailed At - Status"',
              },
            ],
          },
          ...(totalPages > 1
            ? [
                {
                  type: "context" as const,
                  elements: [
                    {
                      type: "mrkdwn" as const,
                      text: `Use /${prefix}-${folder} mail -p <page> to see other pages and /${prefix}-folder [mailId] to see more details on an item`,
                    },
                  ],
                },
              ]
            : []),
        ],
        response_type: "ephemeral",
      });
    } else {
      if (query.startsWith("ltr")) {
        const item = await mailClient.letter({ id: query });

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

        const events = item.data.letter.events?.length
          ? item.data.letter.events
              .map((event, index) =>
                [
                  `  • *${index + 1}*`,
                  `     - Happened At: ${formatDate(event.happened_at)}`,
                  `     - Description: ${event.description ?? "No description"}`,
                  `     - Location: ${event.location}`,
                  `     - Facility: ${event.facility}`,
                  `     - Source: ${event.source}`,
                ].join("\n"),
              )
              .join("\n")
          : "No events";

        const userText = [
          {
            label: "ID",
            value: `<${item.data.letter.public_url}|${item.data.letter.id}>`,
          },
          {
            label: "Title",
            value:
              item.data.letter.title ??
              "I'm a pretty little femboy >w< I mean this has no name",
          },
          {
            label: "Status",
            value: item.data.letter.status ?? "No status set",
          },
          {
            label: "Tags",
            value:
              item.data.letter.tags.length > 0
                ? item.data.letter.tags.join(", ")
                : "No tags set",
          },
          {
            label: "Created at",
            value: formatDate(item.data.letter.created_at),
          },
          {
            label: "Last updated at",
            value: formatDate(item.data.letter.updated_at),
          },
          {
            label: "Events",
            value: "\n" + events,
          },
        ]
          .map((f) => `*${f.label}*: ${f.value}`)
          .join("\n");
        return await client.chat.postEphemeral({
          channel: command.channel_id,
          user: command.user_id,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: userText,
              },
            },
          ],
        });
      } else if (query.startsWith("pkg")) {
          const item = await mailClient.package({ id: query });
  
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
  
          const contents = item.data.contents?.length
            ? item.data.contents
                .map((item, index) =>
                  [
                    `  • *${index + 1}*`,
                    `     - Item SKU: ${item.hc_sku}`,
                    `     - Name: ${item.name ?? "No name provided"}`,
                    `     - Quantity: ${item.quantity}`,
                  ].join("\n"),
                )
                .join("\n")
            : "No events";
  
          const userText = [
            {
              label: "ID",
              value: `<${item.data.public_url}|${item.data.id}>`,
            },
            {
              label: "Title",
              value:
                item.data.title ??
                "I'm a pretty little femboy >w< I mean this has no name",
            },
            {
              label: "Status",
              value: item.data.status ?? "No status set",
            },
            {
              label: "Tags",
              value:
                item.data.tags.length > 0
                  ? item.data.tags.join(", ")
                  : "No tags set",
            },
            {
              label: "Created at",
              value: formatDate(item.data.created_at),
            },
            {
              label: "Last updated at",
              value: formatDate(item.data.updated_at),
            },
            {
              label: "Dispatched at",
              value: item.data.dispatched_at ? formatDate(item.data.dispatched_at) : "Not dispatched yet",
            },
            {
              label: "Mailed at",
              value: item.data.mailed_at ? formatDate(item.data.mailed_at) : "Not mailed yet",
            },
            {
              label: "Contents",
              value: "\n" + contents,
            },
          ]
            .map((f) => `*${f.label}*: ${f.value}`)
            .join("\n");
          return await client.chat.postEphemeral({
            channel: command.channel_id,
            user: command.user_id,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: userText,
                },
              }
            ],
          });
        
      } else {
        return respond({
          text: "This only supports packages (ids starting with pkg!) and letters (ids starting with ltr!).",
          response_type: "ephemeral",
        });
      }
    }
  },
};
