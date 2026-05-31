import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import ysws from "@/ysws";

export default {
  name: "register",
  desc: "Register to use the bot!",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { userData, logger, client, folder, callbackId, prefix, yswsData }: RequestHandler,
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

      if (userData && Object.keys(userData).length === 0)
        return await respond({
          text:
            "You don't exist in db! Run /" +
            prefix +
            " register first",
          response_type: "ephemeral",
        });

      if (yswsData && Object.keys(yswsData).length > 0)
        return await respond({
          text:
            "You already got an api key setup in db. Run /" +
            prefix +
            "-" +
            folder +
            " " +
            "config to change it",
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
            userData: JSON.stringify(userData),
          }),
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "Go to explore, people, search your name, click it, open in new tab, grab it from user id from url 'https://macondo.hackclub.com/u/{userId}'",
              },
            },
            {
              type: "input",
              block_id: "mcAccId",
              label: {
                type: "plain_text",
                text: "What is your user id?",
              },
              element: {
                type: "plain_text_input",
                action_id: "acc_id",
                multiline: false,
              },
            },
            {
              type: "input",
              block_id: "personal",
              label: {
                type: "plain_text",
                text: "What is your region for regional pricing?",
              },
              element: {
                type: "static_select",
                action_id: "region",
                placeholder: {
                  type: "plain_text",
                  text: "Select your region",
                  emoji: true,
                },
                options: Object.entries(ysws.macondo.regions).map(
                  ([code, name]) => ({
                    text: {
                      type: "plain_text",
                      text: name,
                      emoji: true,
                    },
                    value: code,
                  }),
                ),
              },
              optional: false,
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
