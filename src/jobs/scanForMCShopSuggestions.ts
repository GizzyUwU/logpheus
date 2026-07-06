import { eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import ysws from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
import { getGenericErrorMessage } from "@/lib/genericError";
import type Macondo from "@/lib/macondo";
import { ZTypes as MacondoTypes } from "@/lib/macondo/types";
import { z } from "zod";
import { mcShopSuggestions } from "@/schema/mcShopSuggestions";

export default {
  name: "scanForMCShopSuggestions",
  interval: 30,
  execute: async ({ clients, client, pg, logger, prefix }: RequestHandler) => {
    try {
      const yswsData = Object.values(ysws).find((x) =>
        x.jobs.includes("scanForMCShopSuggestions"),
      );

      if (!yswsData) return;
      if (
        !yswsData.jobConfig.scanForMCShopSuggestions ||
        !yswsData.jobConfig.scanForMCShopSuggestions.channelId
      ) {
        logger.info(
          "scanForMCShopSuggestions job skipped becasue didn't meet requirements",
        );
        return;
      }

      const clientKey = `${yswsData.id}:scanForMCShopSuggestions`;
      if (!clients[clientKey]) {
        const AdapterClass = await loadAdapter(yswsData.adapter);
        clients[clientKey] = new AdapterClass(undefined, logger);
      }

      const yswsClient = clients[clientKey].raw as Macondo;
      let page = 1;
      let total: number | null = null;

      const allShopSuggestions: z.infer<
        typeof MacondoTypes.ShopSuggestionItem
      >[] = [];
      while (true) {
        const shopSuggestions = await yswsClient.shopSuggestions({
          sort: "top",
          limit: 50,
          page,
        });

        if (!shopSuggestions || !shopSuggestions.status) {
          const ctx = logger.with({
            status: shopSuggestions?.status,
            ok: shopSuggestions?.ok,
          });
          ctx.error(
            "scanForMCShopSuggestions failed because shopSuggestion api fail",
          );
          break;
        }

        if (shopSuggestions.status === 429) {
          logger
            .with({ page })
            .warn("rate limited on shopSuggestions (429), retrying page");

          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        if (!shopSuggestions.ok || !shopSuggestions.data.items?.length) {
          if (shopSuggestions.status === 408) break;
          if (
            shopSuggestions.status === 200
          ) {
            logger.warn("API returned data with no items");
            break;
          }

          const msg = getGenericErrorMessage(shopSuggestions.status, prefix!);
          if (msg === "Server is down!" || msg === "Server timed out!") break;

          const ctx = logger.with({
            msg,
            status: shopSuggestions.status,
            ok: shopSuggestions.ok,
          });
          ctx.error(
            "scanForMCShopSuggestions failed because shopSuggestion api fail",
          );
          page++;
          break;
        }

        const { items, total: newTotal } = shopSuggestions.data;
        allShopSuggestions.push(...items);
        if (typeof newTotal === "number") total = newTotal;
        page++;
        if (total !== null && (page - 1) * 50 >= total) break;
        if (items.length < 50) break;
      }

      if (allShopSuggestions.length === 0) {
        const ctx = logger.with({
          lastCode: yswsClient.lastCode,
          file: "scanForMcShopSuggestions"
        })
        ctx.error("All Shop Suggestions is empty implying an issue occurred")
        return;
      }

      const storedItems = await pg.select().from(mcShopSuggestions);
      if (storedItems.length === 0) {
        try {
          await pg
            .insert(mcShopSuggestions)
            .values(
              allShopSuggestions.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description ? item.description : null,
                storeUrl: item.store_url ? item.store_url : null,
                imageUrl: item.image_url ? item.image_url : null,
                groupTag: item.group_tag ? item.group_tag : null,
                upvoteCount: item.upvote_count ?? 0,
                showUsername: item.show_username ?? false,
                createdAt: item.created_at ?? new Date().toISOString(),
                submitter:
                  item.submitter !== null
                    ? JSON.stringify(item.submitter)
                    : null,
              })),
            )
          return;
        } catch (err) {
          const ctx = logger
            .with({
              error: err,
              message: err instanceof Error ? err.message : String(err),
              cause: (err as any)?.cause,
            })
          ctx.error(
              `Failed insertion of shop suggestion row for all items on YSWS ${yswsData.id}`,
            );
        }
      }

      const storedMap = new Map(storedItems.map((item) => [item.id, item]));
      const liveIds = new Set(allShopSuggestions.map((item) => item.id));
      for (const [id, stored] of storedMap) {
        if (liveIds.has(id)) continue;

        await pg.delete(mcShopSuggestions).where(eq(mcShopSuggestions.id, id));

        const changeText = [
          {
            label: `${stored.name} was removed.`,
            value: "",
          },
        ]
          .map((f) =>
            f.label && (!f.value || f.value.length === 0)
              ? `*${f.label}*`
              : `*${f.label}*: ${f.value}`,
          )
          .join("\n");

        await client.chat.postMessage({
          channel: yswsData.jobConfig.scanForMCShopSuggestions!.channelId,
          unfurl_links: false,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `1 item was removed from shop suggestions! Could mean it got rejected or accepted!`,
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
                  text: `${stored.storeUrl !== null ? `<${stored.storeUrl}|View Store URL>` : "No store url provided"} ${stored.showUsername ? `- Submitted by ${JSON.parse(stored.submitter!)?.username}` : ""}`,
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

      for (const shopSuggestionItem of allShopSuggestions) {
        const stored = storedMap.get(shopSuggestionItem.id);
        if (!stored) {
          try {
            await pg
              .insert(mcShopSuggestions)
              .values({
                id: shopSuggestionItem.id,
                name: shopSuggestionItem.name,
                description: shopSuggestionItem.description,
                storeUrl: shopSuggestionItem.store_url,
                imageUrl: shopSuggestionItem.image_url,
                groupTag: shopSuggestionItem.group_tag,
                upvoteCount: shopSuggestionItem.upvote_count,
                showUsername: shopSuggestionItem.show_username,
                createdAt: shopSuggestionItem.created_at,
                submitter:
                  shopSuggestionItem.submitter !== null
                    ? JSON.stringify(shopSuggestionItem.submitter)
                    : null,
              })
          } catch (err) {
            logger
              .with({
                error: err,
                message: err instanceof Error ? err.message : String(err),
                cause: (err as any)?.cause,
              })
              .error(
                `Failed insertion of shop row for item ${shopSuggestionItem.id} on YSWS ${yswsData.id}`,
              );
          }

          await client.chat.postMessage({
            channel: yswsData.jobConfig.scanForMCShopSuggestions!.channelId,
            unfurl_links: false,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: `New item was suggested to the shop!`,
                },
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text:
                    `*${shopSuggestionItem.name}*\n` +
                    (() => {
                      const desc = `${
                        shopSuggestionItem.description ??
                        "No description provided"
                          .split("\n")
                          .map((line: string) => line)
                          .join("\n")
                      }`;
                      return desc.length > 500
                        ? desc.slice(0, desc.lastIndexOf(" ", 497)) + "..."
                        : desc;
                    })(),
                },
                accessory: {
                  type: "image",
                  image_url:
                    shopSuggestionItem.image_url ??
                    "https://png.pngtree.com/png-vector/20221125/ourlarge/pngtree-no-image-available-icon-flatvector-illustration-pic-design-profile-vector-png-image_40966566.jpg",
                  alt_text: shopSuggestionItem.name,
                },
              },
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: `${shopSuggestionItem.store_url !== null ? `<${shopSuggestionItem.store_url}|View Store URL>` : "No store url provided"} ${shopSuggestionItem.show_username ? `- Submitted by ${shopSuggestionItem.submitter?.username}` : ""}`,
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

        if (stored.upvoteCount !== shopSuggestionItem.upvote_count) {
          try {
            await pg
              .update(mcShopSuggestions)
              .set({
                upvoteCount: shopSuggestionItem.upvote_count,
              })
              .where(eq(mcShopSuggestions.id, shopSuggestionItem.id));
          } catch (err) {
            logger
              .with({
                error: err,
                message: err instanceof Error ? err.message : String(err),
                cause: (err as any)?.cause,
              })
              .error(
                `Failed insertion of shop row for item ${shopSuggestionItem.id} on YSWS ${yswsData.id}`,
              );
          }

          await client.chat.postMessage({
            channel: yswsData.jobConfig.scanForMCShopSuggestions!.channelId,
            unfurl_links: false,
            blocks: [
              {
                type: "header",
                text: {
                  type: "plain_text",
                  text: `${shopSuggestionItem.name} got another upvote! It is at ${shopSuggestionItem.upvote_count} upvotes!`,
                },
              },
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: (() => {
                    const desc = `${
                      shopSuggestionItem.description ??
                      "No description provided"
                        .split("\n")
                        .map((line: string) => line)
                        .join("\n")
                    }`;
                    return desc.length > 500
                      ? desc.slice(0, desc.lastIndexOf(" ", 497)) + "..."
                      : desc;
                  })(),
                },
                accessory: {
                  type: "image",
                  image_url:
                    shopSuggestionItem.image_url ??
                    "https://png.pngtree.com/png-vector/20221125/ourlarge/pngtree-no-image-available-icon-flatvector-illustration-pic-design-profile-vector-png-image_40966566.jpg",
                  alt_text: shopSuggestionItem.name,
                },
              },
              {
                type: "context",
                elements: [
                  {
                    type: "mrkdwn",
                    text: `${shopSuggestionItem.store_url !== null ? `<${shopSuggestionItem.store_url}|View Store URL>` : "No store url provided"} ${shopSuggestionItem.show_username ? `- Submitted by ${shopSuggestionItem.submitter?.username}` : ""}`,
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
      }
    } catch (err) {
      const ctx = logger.with({
        error: err,
      });
      ctx.error("scanForMCShopSuggestions failed from an error");
    }
  },
};
