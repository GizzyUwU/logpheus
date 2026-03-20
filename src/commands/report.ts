import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq, count } from "drizzle-orm";
import { users } from "../schema/users";
import type { RequestHandler } from "..";
import { vikClient } from "..";
import type { VikunjaClient } from "node-vikunja";

export default {
  name: "report",
  requireVikunja: true,
  desc: "Oopsie. Did I do a silly? Let me know by reporting the silly issue.",
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

      const tasksList = await (vikClient as VikunjaClient).tasks.getProjectTasks(Number(process.env["VIKUNJA_BUG_PROJECT_ID"]));
      const userTasks = tasksList?.filter(
        (task) =>
          task.title.includes(command.user_id) &&
          !task.done
      );

      if (userTasks && userTasks?.length >= 3) {
        return await respond({
          text:
            "We restrict bug reports to 3 open issues per user",
          response_type: "ephemeral",
        });
      }

      const res = (await pg
        .select({ count: count() })
        .from(users)
        .limit(1)
        .where(eq(users.userId, command.user_id))) as { count: number }[];
      const existingCount = res[0]?.count ?? 0;
      if (existingCount === 0)
        return await respond({
          text:
            "We restrict bug reports to users only. Run /" +
            prefix +
            "-register to get started.",
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
              type: "input",
              block_id: "requestTitle",
              label: {
                type: "plain_text",
                text: "Give your request a small title so I can know what it is at a glance.",
              },
              element: {
                type: "plain_text_input",
                action_id: "title",
                multiline: false,
              },
            },
            {
              type: "input",
              block_id: "requestBody",
              label: {
                type: "plain_text",
                text: "Now explain the silly little issue!",
              },
              element: {
                type: "plain_text_input",
                action_id: "body",
                multiline: true,
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
