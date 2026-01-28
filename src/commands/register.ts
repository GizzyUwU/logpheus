import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq, count } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";

export default {
  name: "register",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, client, callbackId, sentryEnabled, Sentry, prefix }: RequestHandler,
  ) => {
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
        if (sentryEnabled) {
          Sentry.captureMessage("There is no channel id for this channel?");
        } else {
          console.error("There is no channel id?", channel);
        }
        return;
      }

      const res = await pg
        .select({ count: count() })
        .from(users)
        .limit(1)
        .where(eq(users.userId, command.user_id)) as { count: number }[];
      if (Number(res[0]?.count) !== 0)
        return await respond({
          text: "You already got an api key setup in db. Run /" + prefix + "-config to change it",
          response_type: "ephemeral",
        });
      await client.views.open({
        trigger_id: command.trigger_id,
        view: {
          type: "modal",
          callback_id: callbackId,
          title: {
            type: "plain_text",
            text: /^[a-z]/i.test(prefix!)
              ? prefix![0]!.toUpperCase() + prefix!.slice(1)
              : prefix!
          },
          blocks: [
            {
              type: "section",
              block_id: "channel_id",
              text: {
                type: "plain_text",
                text: "Channel: " + command.channel_id,
              },
            },
            {
              type: "section",
              block_id: "user_id",
              text: {
                type: "plain_text",
                text: "User: " + command.user_id,
              },
            },
            {
              type: "input",
              block_id: "ftApiKey",
              label: {
                type: "plain_text",
                text: "What is your flavortown api key?",
              },
              element: {
                type: "plain_text_input",
                action_id: "api_input",
                multiline: false,
              },
            },
          ],
          submit: {
            type: "plain_text",
            text: "Submit",
          },
        },
      });
    } catch (error: any) {
      if (
        error.code === "slack_webapi_platform_error" &&
        error.data?.error === "channel_not_found"
      ) {
        await respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
        return;
      } else {
        if (sentryEnabled) {
          Sentry.captureException(error);
        } else {
          console.error(error);
        }

        await respond({
          text: "An unexpected error occurred!",
          response_type: "ephemeral",
        });
      }
    }
  },
};
