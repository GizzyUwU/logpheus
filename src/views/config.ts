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
      const checkKey = values["ftApiKey"]?.["api_input"]?.value?.trim();
      // const optOuts = values["optOuts"]?.["opt_out"]?.value?.trim().split(",");
      const metaRegion = values["meta"]?.["region"]?.value?.trim();

      const updateFields: Partial<UserRow> = {};
      if (checkKey) {
        const working = await checkAPIKey({
          db: pg,
          apiKey: checkKey,
          logger,
          register: true,
        });
        if (!working.works)
          return await client.chat.postEphemeral({
            channel: channelId,
            user: userId,
            text: "Flavortown API Key is invalid, provide a valid one.",
          });

        const apiKey = checkKey!;
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

      if (metaRegion) {
        updateFields.meta = ["Region::" + metaRegion];
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
