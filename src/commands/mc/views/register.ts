import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { yswsUsers } from "@/schema/ysws";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import ysws from "@/ysws";
type UserInsert = typeof yswsUsers.$inferInsert;

export default {
  name: "register",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, userData, yswsData, yswsId, opClient }: RequestHandler & { yswsId: number },
  ): Promise<void | ChatPostEphemeralResponse> => {
    try {
      const metadata = JSON.parse(view.private_metadata);
      const channelId = metadata.channel;
      const userId = body.user.id;

      if (!channelId || !userId) {
        const ctx = logger.with({
          view,
        });
        if (!channelId) {
          ctx.error("There is no channel id for this channel?");
        } else {
          ctx.error("There is no user id for this user?");
        }

        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "An unexpected error occurred!",
        });
      }

      const values = view.state.values;
      const flatValues = Object.entries(values).reduce(
        (acc, [, block]) => {
          for (const [actionId, val] of Object.entries(block)) {
            acc[actionId] = val.value?.trim();
          }
          return acc;
        },
        {} as Record<string, string | undefined>,
      );

      const regionOpt =
        values?.["personal"]?.["region"]?.selected_option?.value?.trim();

      if (yswsData && Object.keys(yswsData).length > 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "You are already registered to this YSWS.",
        });

      const exists = await pg
        .select()
        .from(yswsUsers)
        .limit(1)
        .where(
          and(
            eq(yswsUsers.accId, flatValues["acc_id"]!),
            eq(yswsUsers.yswsId, yswsId),
          ),
        );

      if (exists.length > 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "This account id is already bound to a user.",
        });

      const insertFields: UserInsert = {
        userId,
        accId: flatValues["acc_id"]!,
        disabled: false,
        region: regionOpt ?? "EU",
        yswsId: yswsId,
      };

      await pg.insert(yswsUsers).values(insertFields);
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        markdown_text:
          "You are now able to use all Macondo based commands! :yay:",
      });

      if (opClient && !userData?.meta?.includes("analytics")) {
        opClient.identify({
          profileId: body.user.id,
          properties: {
            friendlyName: "generic",
          },
        });
        opClient.track("signup", {
          ysws: Object.values(ysws).find((x) => x.id === yswsId)?.humanName ?? "unknown"
        });
        opClient.clear();
      }
    } catch (err) {
      const ctx = logger.with({
        data: {
          channel: JSON.parse(view.private_metadata).channel ?? "",
          user: body.user.id ?? "",
        },
      });
      ctx.error("Unexpected error occurred", {
        error: err,
      });
      await client.chat.postEphemeral({
        channel: JSON.parse(view.private_metadata).channel ?? "",
        user: body.user.id ?? "",
        text: "An unexpected error occurred!",
      });
    }
  },
};
