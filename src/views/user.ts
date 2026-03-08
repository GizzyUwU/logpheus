import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";
import type { ChatPostEphemeralResponse } from "@slack/web-api";
import checkAPIKey from "../lib/apiKeyCheck";

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
    { view, body }: SlackViewMiddlewareArgs,
    { pg, logger, client, clients, prefix }: RequestHandler,
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

      const { target_user } = view.state.values as {
        target_user: {
          user: {
            type: string;
            selected_user: string;
          };
        };
      };

      const targetId = target_user.user.selected_user;
      const userData = await pg
        .select()
        .from(users)
        .limit(1)
        .where(eq(users.userId, userId));

      if (userData.length === 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `You don't exist in the db! Run /${prefix}-register`,
        });
      const checkKey = userData[0]?.apiKey;
      const working = await checkAPIKey({
        db: pg,
        apiKey: checkKey,
        logger,
        register: true,
      });
      if (!working) 
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: `You're api key isn't working! Try re-entering it with /${prefix}-config`,
        });
      

      const apiKey = checkKey!;

      let ftClient: FT = clients[apiKey]!;
      if (!ftClient) {
        ftClient = new FT(apiKey, logger);
      }

      const queryWithTarget = await ftClient.users({
        query: targetId,
      });

      if (!queryWithTarget || !queryWithTarget.status) {
        return client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Unexpected error has occurred.",
        });
      }

      if (!queryWithTarget.ok || !queryWithTarget.data.users?.length) {
        switch (queryWithTarget.status) {
          case 401:
            return client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: "Bad API Key! Run /" + prefix + "-config to fix!",
            });
          default:
            return client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: "User doesn't have an FT account.",
            });
        }
      }

      const targetUser = await ftClient.user({
        id: String(queryWithTarget.data.users[0]?.id),
      });

      if (!targetUser || !targetUser.status) {
        return client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "Unexpected error has occurred.",
        });
      }

      if (!targetUser.ok || !Object.keys(targetUser.data)?.length) {
        switch (targetUser.status) {
          case 401:
            return client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: "Bad API Key! Run /" + prefix + "-config to fix!",
            });
          default:
            return client.chat.postEphemeral({
              channel: channelId,
              user: userId,
              text: "User doesn't have an FT account.",
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
      return await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
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
                  "https://flavortown.hackclub.com/users/" + targetUser.data.id,
              },
            ],
          },
        ],
      });
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
