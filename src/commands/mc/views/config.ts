import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { and, eq } from "drizzle-orm";
import type { RequestHandler } from "@/index.ts";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import { yswsUsers } from "@/schema/ysws";
import ysws from "@/ysws";
import { loadAdapter } from "@/lib/adapters";
type UserRow = typeof yswsUsers._.inferSelect;

export default {
  name: "config",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, clients, prefix, folder, yswsData, yswsId }: RequestHandler & { yswsId: number },
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

      const flatValues = Object.entries(view.state.values).reduce(
        (acc, [, block]) => {
          for (const [actionId, val] of Object.entries(block)) {
            acc[actionId] = val.value?.trim();
          }
          return acc;
        },
        {} as Record<string, string | undefined>,
      );
      
      const updateFields: Partial<UserRow> = {};
      if (flatValues["acc_id"]) {
        const accId = flatValues["acc_id"]!;
        if (yswsData && Object.keys(yswsData).length === 0)
          return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: `Hey! You aren't registered to this ysws, register to it with /${prefix}-${folder} register`,
          });

        updateFields.accId = accId
        if (yswsData?.disabled) updateFields.disabled = false;
        if (!clients[`${yswsData?.yswsId}:${yswsData?.userId}`]) {
          const AdapterClass = await loadAdapter(ysws.macondo.adapter);
          clients[`${yswsData?.yswsId}:${yswsData?.userId}`] = new AdapterClass(logger)
        }
      }

      if (flatValues["region"]) {
        updateFields.region = flatValues["region"];
      }

      if (view.state.values?.["jobs"]?.["jobs"]?.selected_options) {
        updateFields.registeredJobs =
          view.state.values["jobs"]["jobs"].selected_options.map(
            (option) => option.value,
          );
      }

      if (flatValues["api_key"]) {
        updateFields.apiKey = flatValues["api_key"];
      }

      if (Object.keys(updateFields).length > 0) {
        await pg
          .update(yswsUsers)
          .set(updateFields)
          .where(and(eq(yswsUsers.userId, userId), eq(yswsUsers.yswsId, yswsId)));

        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Updated successfully! :yippeee:",
        });
      } else {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Nothing to do as nothing changed. :sad-pf:",
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
