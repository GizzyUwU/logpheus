import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import { capabilities, isCapability } from "../capabilities";
type UserRow = typeof users._.inferSelect;

export default {
  name: "allow",
  params: "[userMention] [capability]",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, client }: RequestHandler,
  ): Promise<void | ChatPostEphemeralResponse> => {
    try {
      const channel = await client.conversations.info({
        channel: command.channel_id,
      });
      if (
        !channel ||
        !channel.channel ||
        Object.keys(channel).length === 0 ||
        !channel.ok
      )
        return await respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
      if (!channel?.channel.id) {
        logger.error("There is no channel id for this channel?");
        return;
      }

      if (command.user_id !== process.env["SLACK_ID_OWNER"])
        return await respond({
          text: "This command is restricted to the id set in env as SLACK_ID_OWNER.",
        });

      const [userIdRaw, capabilityRaw] = command.text
        .trim()
        .split(" ")
        .filter(Boolean);

      if (!userIdRaw || !capabilityRaw)
        return await respond({
          text:
            "You are required to provide both a user mention and a capability.\n\n" +
            "Available capabilities:\n" +
            capabilities.map((c) => `• ${c}`).join("\n"),
        });

      const capability = capabilityRaw.replace(/[^a-zA-Z0-9\s]/g, "");

      const match = userIdRaw.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/);
      if (!match)
        return respond({
          text: `This wasn't a valid user mention try actually mentioning a user for the argument in this command.`,
          response_type: "ephemeral",
        });

      const userId = match[1];
      if (!userId)
        return respond({
          text: `This wasn't a valid user mention try actually mentioning a user for the argument in this command.`,
          response_type: "ephemeral",
        });

      if (!isCapability(capability))
        return await respond({
          text: "This capability doesn't exist.",
        });

      const res = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, userId));

      if (res.length === 0)
        return await respond({
          text: "The user you mentioned isn't in the database.",
        });

      const updateFields: Partial<UserRow> = {
        meta: Array.from(new Set([...(res[0]?.meta ?? []), capability])),
      };

      await pg.update(users).set(updateFields).where(eq(users.userId, userId));

      await respond({
        text:
          "The capability has successfully been added to the user.",
      });
    } catch (err) {
      const ctx = logger.with({
        data: {
          channel: command.channel_id ?? "",
          user: command.user_id ?? "",
        },
      });
      console.log(err)
      ctx.error("Unexpected error occurred", {
        error: err,
      });
      await respond({
        text: "An unexpected error occurred!",
      });
    }
  },
};
