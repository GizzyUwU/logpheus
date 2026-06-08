import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import type { RequestHandler } from "@/index.ts";
import type { AnyBlock, PlainTextOption } from "@slack/web-api";

export default {
  name: "config",
  desc: "Need to change the bots configuration on you?",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { logger, client, callbackId, prefix, userData }: RequestHandler,
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

      const name = /^[a-z]/i.test(prefix!)
        ? prefix![0]!.toUpperCase() + prefix!.slice(1)
        : prefix!;

      const optOuts: PlainTextOption[] = Object.entries({
        analytics: "Analytics",
      }).map(([code, name]) => ({
        text: {
          type: "plain_text",
          text: String(name),
          emoji: true,
        },
        value: code,
      }));

      await client.views.open({
        trigger_id: command.trigger_id,
        view: {
          type: "modal",
          callback_id: callbackId!,
          title: {
            type: "plain_text",
            text: "Configure " + name + "!",
          },
          private_metadata: JSON.stringify({
            channel: command.channel_id,
          }),
          blocks: [
            {
              type: "input",
              block_id: "personal",
              label: {
                type: "plain_text",
                text: "Want to opt out of something? Chosoe from below's options!",
              },
              element: {
                type: "multi_static_select",
                action_id: "optouts",
                placeholder: {
                  type: "plain_text",
                  text: "Select an opt out",
                  emoji: true,
                },
                options: optOuts,
                initial_options: optOuts.filter((o) =>
                  (userData?.optOuts ?? []).includes(o.value ?? ""),
                ),
              },
              optional: true,
            },
            ...(userData?.channel
              ? ([
                  {
                    type: "input",
                    block_id: "pingGroupBlock",
                    label: {
                      type: "plain_text",
                      text: "Got a ping group? Want it to be pinged when a new log happens? Add it's id here!",
                    },
                    element: {
                      type: "plain_text_input",
                      action_id: "pingGroupId",
                      multiline: false,
                      initial_value:
                        userData?.meta
                          ?.find((s) => s.startsWith("PingGroup::"))
                          ?.split("::")[1] ?? "",
                    },
                    optional: true,
                  },
                ] as AnyBlock[])
              : []),
            {
              type: "input",
              block_id: "HCBId",
              label: {
                type: "plain_text",
                text: "Want to get DM'd about transactions on your HCB account? Get your id from HCBScan!",
              },
              element: {
                type: "plain_text_input",
                action_id: "HCBId",
                multiline: false,
                initial_value:
                  userData?.meta
                    ?.find((s) => s.startsWith("HCBId::"))
                    ?.split("::")[1] ?? "",
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
