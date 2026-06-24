import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { eq } from "drizzle-orm";
import { users } from "@/schema/users";
import type { RequestHandler } from "@/index.ts";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
type UserRow = typeof users._.inferSelect;

export default {
  name: "config",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, userData }: RequestHandler,
  ): Promise<void | ChatPostEphemeralResponse> => {
    try {
      const channelId = JSON.parse(view.private_metadata).channel;
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

      const updateFields: Partial<UserRow> = {};
      let updatedMeta = userData?.meta ?? [];
      if (flatValues["pingGroupId"]) {
        updatedMeta = [...updatedMeta.filter(e => !e.startsWith("PingGroup::")), "PingGroup::" + flatValues["pingGroupId"]];
      }
      if (flatValues["HCBId"]) {
        updatedMeta = [...updatedMeta.filter(e => !e.startsWith("HCBId::")), "HCBId::" + flatValues["HCBId"]];
      }
      if (flatValues["channelId"]) {
        updateFields.channel = flatValues["channelId"];
      }
      if (flatValues["theseusKey"]) {
        updateFields.theseusKey = flatValues["theseusKey"];
      }
    
      updateFields.meta = updatedMeta

      const optoutsBlock = view.state.values?.["personal"]?.["optouts"] as any;

      if (optoutsBlock?.selected_options) {
        const incoming = optoutsBlock.selected_options
          .map((o: any) => o.value)
          .filter(Boolean);

        const existing = userData?.optOuts ?? [];

        updateFields.optOuts = Array.from(new Set([...existing, ...incoming]));
      }

      if (Object.keys(updateFields).length > 0) {
        await pg
          .update(users)
          .set(updateFields)
          .where(eq(users.userId, userId));

        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Updated successfully! :yay:",
        });
      } else {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Nothing to do as nothing changed.",
        });
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
