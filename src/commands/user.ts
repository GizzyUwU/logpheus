import type { SlackCommandMiddlewareArgs } from "@slack/bolt";
import checkAPIKey from "../lib/apiKeyCheck";
import type { RequestHandler } from "..";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import FT from "../lib/ft";
import { getGenericErrorMessage } from "../lib/genericError";

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export default {
  name: "user",
  execute: async (
    { command, respond }: SlackCommandMiddlewareArgs,
    { pg, client, clients, logger, callbackId, prefix }: RequestHandler,
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
      const userExists = await pg
        .select()
        .from(users)
        .where(eq(users.userId, command.user_id))
        .limit(1);

      if (userExists.length === 0)
        return respond({
          text: `Hey! Looks like you don't exist in the db? You can't use this bot in this state. Register to the bot with /${prefix}-register`,
          response_type: "ephemeral",
        });

      const checkKey = userExists[0]?.apiKey;
      const working = await checkAPIKey({
        apiKey: checkKey,
        logger,
      });

      if (!working.works)
        return respond({
          text: `Hey! Your api key is currently failing the test to see if it works, run /${prefix}-config to re-enter your api key to fix it.`,
          response_type: "ephemeral",
        });

      const apiKey = checkKey!;

      const mention = command.text.trim();
      if (!mention) {
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
                block_id: "target_user",
                element: {
                  type: "users_select",
                  action_id: "user",
                  placeholder: {
                    type: "plain_text",
                    text: "Pick a user",
                  },
                },
                label: {
                  type: "plain_text",
                  text: "User",
                },
              },
            ],
            submit: {
              type: "plain_text",
              text: "Submit",
            },
          },
        });
      } else {
        const match = mention.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/);
        if (!match)
          return respond({
            text: `This wasn't a valid user mention try actually mentioning a user for the argument in this command.`,
            response_type: "ephemeral",
          });

        const mentionId = match[1];

        let ftClient: FT = clients[apiKey]!;
        if (!ftClient) {
          ftClient = new FT(apiKey, logger);
        }

        const queryWithTarget = await ftClient.users({
          query: mentionId,
        });

        if (!queryWithTarget || !queryWithTarget.status) {
          return respond({
            text: "Unexpected error has occurred.",
          });
        }

        if (!queryWithTarget.ok || !queryWithTarget.data.users?.length) {
          switch (queryWithTarget.status) {
            case 404:
              return respond({
                text: "User doesn't have an FT account.",
                response_type: "ephemeral",
              });
            default:
              const msg = getGenericErrorMessage(
                queryWithTarget.status,
                prefix!,
              );
              return respond({
                text: msg ?? "Unexpected error has occured!",
                response_type: "ephemeral",
              });
          }
        }

        const targetUser = await ftClient.user({
          id: String(queryWithTarget.data.users[0]?.id),
        });

        if (!targetUser || !targetUser.status) {
          return respond({
            text: "Unexpected error has occurred.",
            response_type: "ephemeral",
          });
        }

        if (!targetUser.ok || !Object.keys(targetUser.data)?.length) {
          switch (targetUser.status) {
            case 404:
              return respond({
                text: "User doesn't have an FT account.",
                response_type: "ephemeral",
              });
            default:
              const msg = getGenericErrorMessage(targetUser.status, prefix!);
              return respond({
                text: msg ?? "Unexpected error has occured!",
                response_type: "ephemeral",
              });
          }
        }

        const userText = [
          { label: "Account ID", value: targetUser.data.id },
          { label: "Cookies", value: targetUser.data.cookies ?? "Disabled" },
          { label: "Votes Count", value: targetUser.data.vote_count },
          { label: "Like Count", value: targetUser.data.like_count },
          {
            label: "Time today",
            value: targetUser.data.devlog_seconds_today
              ? formatDuration(targetUser.data.devlog_seconds_today)
              : "0s",
          },
          {
            label: "Total Time",
            value: targetUser.data.devlog_seconds_total
              ? formatDuration(targetUser.data.devlog_seconds_total)
              : "0s",
          },
          {
            label: "Projects",
            value:
              targetUser.data.project_ids &&
              targetUser.data.project_ids.length > 0
                ? targetUser.data.project_ids
                    .map(
                      (id: string | number) =>
                        `<https://flavortown.hackclub.com/projects/${id}|${id}>`,
                    )
                    .join(", ")
                : "No projects",
          },
        ]
          .map((f) => `*${f.label}*: ${f.value}`)
          .join("\n");
        return await respond({
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: targetUser.data.display_name ?? "Unknown",
                emoji: true,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: userText,
              },
              accessory: {
                type: "image",
                image_url:
                  targetUser.data.avatar ??
                  "https://avatars.slack-edge.com/2026-02-16/10546676907328_5d442ad696e294c5feb7_512.png",
                alt_text:
                  (targetUser.data.display_name ?? "Unknown") + "'s avatar",
              },
            },
            {
              type: "divider",
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text:
                    "https://flavortown.hackclub.com/users/" +
                    targetUser.data.id,
                },
              ],
            },
          ],
          response_type: "ephemeral",
        });
      }
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
