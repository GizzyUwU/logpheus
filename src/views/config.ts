import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import { eq } from "drizzle-orm";
import FT from "../lib/ft";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import checkAPIKey from "../lib/apiKeyCheck";
type UserRow = typeof users._.inferSelect;

export default {
  name: "config",
  execute: async (
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, clients }: RequestHandler,
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
      // const optOuts = values["optOuts"]?.["opt_out"]?.value?.trim().split(",");

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
      if (flatValues["api_input"]) {
        const working = await checkAPIKey({
          db: pg,
          apiKey: flatValues["api_input"],
          logger,
          register: true,
        });
        if (!working.works)
          return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "Flavortown API Key is invalid, provide a valid one.",
          });

        const apiKey = flatValues["api_input"]!;
        const ftClient = new FT(apiKey, logger);

        const dbData = await pg
          .select()
          .from(users)
          .limit(1)
          .where(eq(users.userId, userId));
        if (dbData.length === 0)
          return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "No entry found for you in DB",
          });

        updateFields.apiKey = apiKey;
        if (dbData[0]?.disabled) updateFields.disabled = false;

        if (!clients[apiKey]) {
          clients[apiKey] = ftClient;
        }
      }

      if (flatValues["region"]) {
        const filteredMeta = (updateFields.meta ?? []).filter(entry => !entry.startsWith("Region::"));
        updateFields.meta = [...filteredMeta, "Region::" + flatValues["region"].toLowerCase()];
      }

      if (flatValues["pingGroupId"]) {
        const filteredMeta = (updateFields.meta ?? []).filter(entry => !entry.startsWith("PingGroup::"));
        updateFields.meta = [...filteredMeta, "PingGroup::" + flatValues["pingGroupId"]];
      }

      if (flatValues["HCBId"]) {
        const filteredMeta = (updateFields.meta ?? []).filter(entry => !entry.startsWith("HCB::"));
        updateFields.meta = [...filteredMeta, "HCBId::" + flatValues["HCBId"]];
      }

      if (Object.keys(updateFields).length > 0) {
        await pg
          .update(users)
          .set(updateFields)
          .where(eq(users.userId, userId));

        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Updated successfully!",
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
