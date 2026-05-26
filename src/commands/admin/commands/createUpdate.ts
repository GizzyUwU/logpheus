import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import { eq } from "drizzle-orm";
import { users } from "@/schema/users";
import type { RequestHandler } from "@/index.ts";
import { Octokit } from "octokit";

export default {
  name: "createUpdate",
  desc: "Owner Only! Create a update log for a commit id!",
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
        .limit(1)
        .where(eq(users.userId, command.user_id))

      if (!res[0]?.meta?.includes("updateCreation")) return await respond({
        text: "Update Creation is tied to the capability updateCreation which you lack.",
        response_type: "ephemeral",
      });

      const git = new Octokit();
      const commit = await git.rest.repos.getCommit({
        owner: "gizzyuwu",
        repo: "logpheus",
        ref: "main"
      })
      const sha = commit.data.sha.slice(0, 7);
      
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
            sha
          }),
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "This update log references the commit: <https://github.com/GizzyUwU/logpheus/commit/" + commit.data.sha + "|" + sha + ">",
              },
            },
            {
              type: "input",
              block_id: "meta",
              label: {
                type: "plain_text",
                text: "What occured this commit?",
              },
              element: {
                type: "rich_text_input",
                action_id: "update_log",
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
