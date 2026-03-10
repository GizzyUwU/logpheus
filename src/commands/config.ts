import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";

export default {
  name: "config",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, logger, client, callbackId, prefix }: RequestHandler,
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
        logger.error("There is no channel id for this channel?");
        return;
      }
  
      const res = await pg
        .select()
        .from(users)
        .where(eq(users.userId, command.user_id));
      if (res.length === 0)
        return await respond({
          text: "Gng you don't even got an api key set to this channel run /logpheus-add first.",
          response_type: "ephemeral",
        });
      await client.views.open({
        trigger_id: command.trigger_id,
        view: {
          type: "modal",
          callback_id: callbackId!,
          title: {
            type: "plain_text",
            text: /^[a-z]/i.test(prefix!)
              ? prefix![0]!.toUpperCase() + prefix!.slice(1)
              : prefix!,
          },
          private_metadata: JSON.stringify({
            channel: command.channel_id,
          }),
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "Get your API key here: <https://flavortown.hackclub.com/kitchen?settings=1#api_key|Flavortown Settings>",
              },
            },
            {
              type: "input",
              block_id: "ftApiKey",
              label: {
                type: "plain_text",
                text: "Need to change your flavortown api key?",
              },
              element: {
                type: "plain_text_input",
                action_id: "api_input",
                multiline: false,
              },
              optional: true,
            },
            // {
            //   type: "input",
            //   block_id: "optOuts",
            //   label: {
            //     type: "plain_text",
            //     text: "Want to opt out of something?",
            //   },
            //   element: {
            //     type: "plain_text_input",
            //     action_id: "opt_out",
            //     multiline: false,
            //   },
            // },
            {
              type: "input",
              block_id: "meta",
              label: {
                type: "plain_text",
                text: "Whats your region? (Used for shop items prices and also disabled items)",
              },
              element: {
                type: "plain_text_input",
                action_id: "region",
                multiline: false,
                initial_value: res[0]?.meta?.[0]?.split("Region::")[1] ?? "",
              },
              optional: true,
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
        logger.error({ error });

        await respond({
          text: "An unexpected error occurred!",
          response_type: "ephemeral",
        });
      }
    }
  },
};
