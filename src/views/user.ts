import type { SlackViewMiddlewareArgs } from "@slack/bolt";
import FT from "../lib/ft";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "..";

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
    { view }: SlackViewMiddlewareArgs,
    { pg, client, clients, sentryEnabled, Sentry, prefix }: RequestHandler,
  ) => {
    const channelBlock = view.blocks.find(
      (block): block is { type: "section"; text: { text: string } } =>
        block.type === "section" && block.block_id === "channel_id",
    );

    const userBlock = view.blocks.find(
      (block): block is { type: "section"; text: { text: string } } =>
        block.type === "section" && block.block_id === "user_id",
    );

    const channelId = channelBlock?.text?.text.slice("Channel: ".length);
    const userId = userBlock?.text?.text.slice("User: ".length);
    if (!channelId || !userId) {
      if (sentryEnabled) {
        Sentry.setContext("view", { ...view });
        if (!channelId) {
          Sentry.captureMessage("There is no channel id for this channel?");
        } else {
          Sentry.captureMessage("There is no user id for this user?");
        }
      } else {
        if (!channelId) {
          console.error("There is no channel id?", view);
        } else {
          console.error("There is no user id?", view);
        }
      }
      return;
    }

    try {
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

      const apiKey = userData[0]?.apiKey;
      if (!apiKey) {
        if (sentryEnabled) {
          Sentry.setUser({
            id: userId,
            channelId: channelId,
          });
          Sentry.captureMessage(
            "User exists in db but lacks an api key in it",
            {
              level: "error",
            },
          );
        } else {
          console.error(`${userId} exists in db and lacks an api key in it`);
        }
        return;
      }

      let ftClient: FT = clients[apiKey]!;
      if (!ftClient) {
        ftClient = new FT(apiKey);
      }

      const queryWithTarget = await ftClient.users({
        query: targetId,
      });

      if (!queryWithTarget || queryWithTarget.users.length === 0)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "User doesn't have an FT account.",
        });

      const targetUser = await ftClient.user({
        id: queryWithTarget.users[0]?.id!,
      });

      if (!targetUser)
        return await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: "User doesn't have an FT account.",
        });

      const userText = [
        { label: "Account ID", value: targetUser.id },
        { label: "Cookies", value: targetUser.cookies ?? "Disabled" },
        { label: "Votes Count", value: targetUser.vote_count },
        { label: "Like Count", value: targetUser.like_count },
        {
          label: "Time today",
          value: formatDuration(targetUser.devlog_seconds_today),
        },
        {
          label: "Total Time",
          value: formatDuration(targetUser.devlog_seconds_total),
        },
        {
          label: "Projects",
          value:
            targetUser.project_ids.length > 0
              ? targetUser.project_ids
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
              text: targetUser.display_name,
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
              image_url: targetUser.avatar,
              alt_text: targetUser.display_name + "'s avatar",
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
                text: "https://flavortown.hackclub.com/users/" + targetUser.id,
              },
            ],
          },
        ],
      });
    } catch (err) {
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: "An unexpected error occurred!",
      });
    }
  },
};
