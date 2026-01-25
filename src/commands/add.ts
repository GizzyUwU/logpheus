import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "..";

export default {
  name: "add",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { callbackId, client, sentryEnabled, Sentry }: RequestHandler,
  ) => {
    try {
      const channel = await client.conversations.info({
        channel: command.channel_id,
      });
      if (!channel)
        return await respond({
          text: "If you are running this in a private channel then you have to add bot manually first to the channel. CHANNEL_NOT_FOUND",
          response_type: "ephemeral",
        });
      if (command.user_id !== channel.channel?.creator)
        return await respond({
          text: "You can only run this command in a channel that you are the creator of",
          response_type: "ephemeral",
        });

      await client.views.open({
        trigger_id: command.trigger_id,
        view: {
          type: "modal",
          callback_id: callbackId,
          title: {
            type: "plain_text",
            text: command.channel_id,
          },
          blocks: [
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
              block_id: "projId",
              label: {
                type: "plain_text",
                text: "What is the project's id",
              },
              element: {
                type: "plain_text_input",
                action_id: "proj_input",
                multiline: false,
              },
            },
            {
              type: "input",
              block_id: "ftApiKey",
              label: {
                type: "plain_text",
                text: "What is your flavortown api key? (This is required everytime you submit a project)",
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
